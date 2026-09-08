-- Console d'administration v2 — PR6 : Signalements & Réglages.
--
-- Deux ajouts :
--
-- 1. Table `player_reports` + RPC. Un signalement a un auteur, une
--    cible, un motif, un état (open / resolved / dismissed) et un
--    commentaire de l'administrateur. Le joueur peut envoyer un
--    signalement via une RPC `submit_player_report` (qui crée la
--    ligne). L'administrateur lit, décide de bannir (résolu) ou de
--    classer sans suite (rejeté). La décision est consignée au
--    journal d'audit.
--
-- 2. RPC pour les réglages de l'app. Le pattern clé/valeur de
--    `app_settings` est déjà en place ; on ajoute deux helpers
--    (`admin_list_settings`, `admin_get_setting`) qui rendent
--    l'UI console possible sans aller chercher la table à la main.
--    On garde `admin_set_setting` qui existait déjà.
--
-- Toutes les fonctions d'administration appellent `require_admin()`,
-- sauf `submit_player_report` qui est accessible à tout joueur
-- connecté.

/* ------------------------------------------------------------------ */
/* Signalements                                                       */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.player_reports (
  id bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_reports TO authenticated;
GRANT ALL ON public.player_reports TO service_role;

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

-- Un joueur ne voit que ses propres signalements en lecture. L'écriture
-- passe par la RPC `submit_player_report` (qui valide le motif).
DROP POLICY IF EXISTS "Mes signalements" ON public.player_reports;
CREATE POLICY "Mes signalements" ON public.player_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());

CREATE INDEX IF NOT EXISTS player_reports_status_idx
  ON public.player_reports (status, created_at DESC);

-- Un joueur peut signaler. On borne le motif à 200 caractères et on
-- empêche de se signaler soi-même.
DROP FUNCTION IF EXISTS public.submit_player_report(uuid, text, text);

CREATE OR REPLACE FUNCTION public.submit_player_report(
  _target uuid,
  _reason text,
  _details text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'On ne se signale pas soi-même';
  END IF;
  IF COALESCE(NULLIF(btrim(_reason), ''), '') = '' THEN
    RAISE EXCEPTION 'Motif requis';
  END IF;
  IF length(_reason) > 200 THEN
    RAISE EXCEPTION 'Motif trop long (200 caractères max)';
  END IF;

  -- La cible doit exister
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target) THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;

  INSERT INTO public.player_reports (reporter_id, target_id, reason, details)
  VALUES (auth.uid(), _target, btrim(_reason), NULLIF(btrim(_details), ''))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_player_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid, text, text) TO authenticated;

-- Liste pour la console, avec le pseudo de l'auteur et de la cible.
-- Filtres : statut, motif (recherche partielle).
DROP FUNCTION IF EXISTS public.admin_list_reports(text, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_reports(
  _status text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  reporter_id uuid,
  reporter_username text,
  target_id uuid,
  target_username text,
  target_banned boolean,
  reason text,
  details text,
  status text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _limit := least(greatest(COALESCE(_limit, 50), 1), 200);
  _offset := greatest(COALESCE(_offset, 0), 0);
  RETURN QUERY
  SELECT
    r.id,
    r.reporter_id,
    rp.username AS reporter_username,
    r.target_id,
    tp.username AS target_username,
    COALESCE(tp.banned, false) AS target_banned,
    r.reason,
    r.details,
    r.status,
    r.resolution_note,
    r.resolved_by,
    r.resolved_at,
    r.created_at
  FROM public.player_reports r
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  LEFT JOIN public.profiles tp ON tp.id = r.target_id
  WHERE (_status IS NULL OR r.status = _status)
    AND (_reason IS NULL OR r.reason ILIKE '%' || _reason || '%')
  ORDER BY
    CASE r.status WHEN 'open' THEN 0 ELSE 1 END,
    r.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_reports(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(text, text, int, int) TO authenticated;

-- Résoudre un signalement : applique la décision (ban ou rejet), note
-- administrative, consigne au journal.
DROP FUNCTION IF EXISTS public.admin_resolve_report(bigint, text, text);

CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  _id bigint,
  _decision text,
  _note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.player_reports;
BEGIN
  PERFORM public.require_admin();
  IF _decision NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Décision inconnue : %', _decision;
  END IF;

  SELECT * INTO _r FROM public.player_reports WHERE id = _id;
  IF _r.id IS NULL THEN
    RAISE EXCEPTION 'Signalement introuvable';
  END IF;
  IF _r.status <> 'open' THEN
    RAISE EXCEPTION 'Signalement déjà traité';
  END IF;

  UPDATE public.player_reports
    SET status = _decision,
        resolution_note = NULLIF(btrim(_note), ''),
        resolved_by = auth.uid(),
        resolved_at = now()
  WHERE id = _id;

  -- Le bannissement n'est pas automatique : c'est une action séparée
  -- via admin_set_banned, qu'on appelle depuis la console. Ici on
  -- consigne juste la décision, l'admin peut ensuite ban en un clic.
  PERFORM public.log_admin(
    'report:' || _decision,
    _r.target_id::text,
    jsonb_build_object('report_id', _r.id, 'note', COALESCE(_note, ''), 'reporter_id', _r.reporter_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(bigint, text, text) TO authenticated;

/* ------------------------------------------------------------------ */
/* Réglages — helpers de lecture                                       */
/* ------------------------------------------------------------------ */

-- La table `app_settings` est déjà en place. On ajoute une fonction
-- qui retourne tous les réglages connus avec leur valeur en JSON,
-- typée pour le client.

DROP FUNCTION IF EXISTS public.admin_list_settings();

CREATE OR REPLACE FUNCTION public.admin_list_settings()
RETURNS TABLE (
  key text,
  value jsonb,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT s.key, s.value, s.updated_at
  FROM public.app_settings s
  ORDER BY s.key ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_settings() TO authenticated;

-- Lecture typée d'un seul réglage. Renvoie NULL s'il n'existe pas —
-- c'est plus simple à gérer côté client qu'un no-row throw.
DROP FUNCTION IF EXISTS public.admin_get_setting(text);

CREATE OR REPLACE FUNCTION public.admin_get_setting(_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT value INTO _v FROM public.app_settings WHERE key = _key;
  RETURN _v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_setting(text) TO authenticated;

NOTIFY pgrst, 'reload schema';