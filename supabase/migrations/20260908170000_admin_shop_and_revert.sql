-- Console d'administration v2 — PR3 : boutique & journal.
--
-- Trois ajouts :
--
-- 1. `admin_shop_sales_summary()` retourne pour chaque article : nombre
--    d'achats sur 7 j, revenu total sur 7 j, et date du dernier achat.
--    Le client s'en sert pour la colonne « Ventes / CA » du tableau
--    Boutique.
--
-- 2. `admin_list_log(_action, _admin_id, _since, _until, _limit, _offset)`
--    remplace `admin_log(int)` : même sortie, mais on peut filtrer par
--    type d'action, par admin, par période, et paginer. Le journal
--    grossit avec l'usage, sans pagination il devient inutilisable.
--
-- 3. `admin_revert_log_entry(_id)` annule une action réversible du
--    journal. Aujourd'hui : jetons (admin_grant_tokens), ban
--    (admin_set_banned), admin (admin_set_admin). Pas d'annulation
--    possible pour les actions de catalogue (item) ou de réglage
--    (setting) : on perdrait de l'information en rétablissant un prix
--    qu'on ne connaît plus. Une action annulée est elle-même consignée
--    au journal, pour qu'on n'ait pas à deviner.
--
-- Toutes les fonctions appellent `require_admin()` au début. Aucune ne
-- touche le client : la console appelle des RPC, le serveur décide.

/* ------------------------------------------------------------------ */
/* Boutique — ventes par article                                       */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_shop_sales_summary();

CREATE OR REPLACE FUNCTION public.admin_shop_sales_summary()
RETURNS TABLE (
  item_id text,
  ventes_7j bigint,
  ca_7j bigint,
  dernier_achat timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT
    si.id,
    COALESCE((
      SELECT count(*) FROM public.purchases pu
      WHERE pu.item_id = si.id
        AND pu.bought_at > now() - interval '7 days'
    ), 0)::bigint AS ventes_7j,
    COALESCE((
      SELECT count(*) FROM public.purchases pu
      WHERE pu.item_id = si.id
        AND pu.bought_at > now() - interval '7 days'
    ), 0) * si.price AS ca_7j,
    (
      SELECT max(pu.bought_at) FROM public.purchases pu
      WHERE pu.item_id = si.id
    ) AS dernier_achat
  FROM public.shop_items si
  ORDER BY si.sort ASC, si.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_shop_sales_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_shop_sales_summary() TO authenticated;

/* ------------------------------------------------------------------ */
/* Journal — lecture filtrée et paginée                                */
/* ------------------------------------------------------------------ */

-- Le journal n'est pas un log qu'on parcourt en mémoire : à terme il
-- grossit avec l'usage. La pagination par `LIMIT/OFFSET` suffit pour
-- l'usage console (les administrateurs n'ont pas besoin du scroll
-- infini, ils cherchent un événement précis).
DROP FUNCTION IF EXISTS public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_log(
  _action text DEFAULT NULL,
  _admin_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  admin_id uuid,
  admin_username text,
  action text,
  target text,
  details jsonb,
  at timestamptz
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
    l.id,
    l.admin_id,
    p.username AS admin_username,
    l.action,
    l.target,
    l.details,
    l.at
  FROM public.admin_log l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  WHERE (_action IS NULL OR l.action = _action)
    AND (_admin_id IS NULL OR l.admin_id = _admin_id)
    AND (_since IS NULL OR l.at >= _since)
    AND (_until IS NULL OR l.at < _until)
  ORDER BY l.at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_log(text, uuid, timestamptz, timestamptz, int, int) TO authenticated;

/* ------------------------------------------------------------------ */
/* Journal — annulation d'une action réversible                        */
/* ------------------------------------------------------------------ */

-- Une action est réversible si on peut calculer l'opération inverse à
-- partir de la ligne du journal (les détails contiennent l'état avant
-- et après). Le mapping action → geste inverse est centralisé ici, le
-- client n'a pas à le connaître.
DROP FUNCTION IF EXISTS public.admin_revert_log_entry(bigint);

CREATE OR REPLACE FUNCTION public.admin_revert_log_entry(_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.admin_log;
  _reverted text;
BEGIN
  PERFORM public.require_admin();

  SELECT * INTO _l FROM public.admin_log WHERE id = _id;
  IF _l.id IS NULL THEN
    RAISE EXCEPTION 'Événement introuvable';
  END IF;

  -- On ne ré-annule pas une annulation, pour ne pas faire boucler la
  -- console. L'entrée « revert » est elle-même consignée par log_admin
  -- plus bas.
  IF _l.action LIKE 'revert:%' THEN
    RAISE EXCEPTION 'Une annulation ne s''annule pas';
  END IF;

  IF _l.action = 'tokens' THEN
    -- Détails : { amount, reason, balance }.
    -- On retire le même montant à la même cible. Si le joueur n'a plus
    -- assez, on retire jusqu'à zéro (cohérent avec admin_grant_tokens
    -- qui floor à 0).
    DECLARE
      _amount int := (_l.details ->> 'amount')::int;
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL OR _amount IS NULL THEN
        RAISE EXCEPTION 'Entrée « tokens » mal formée';
      END IF;
      UPDATE public.profiles
        SET tokens = greatest(0, tokens - _amount)
        WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'tokens';
    END;

  ELSIF _l.action = 'ban' THEN
    DECLARE
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL THEN
        RAISE EXCEPTION 'Entrée « ban » mal formée';
      END IF;
      UPDATE public.profiles SET banned = false WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'ban';
    END;

  ELSIF _l.action = 'admin' THEN
    DECLARE
      _target uuid := _l.target::uuid;
    BEGIN
      IF _target IS NULL THEN
        RAISE EXCEPTION 'Entrée « admin » mal formée';
      END IF;
      -- On ne révoque pas le dernier administrateur restant, pour ne
      -- pas fermer la porte de l'intérieur. La logique de garde est
      -- la même que admin_set_admin.
      IF (
        SELECT count(*) FROM public.profiles WHERE is_admin = true
      ) <= 1 AND _l.details ->> 'is_admin' = 'true' THEN
        RAISE EXCEPTION 'Dernier administrateur : annulation refusée';
      END IF;
      UPDATE public.profiles SET is_admin = false WHERE id = _target;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joueur introuvable';
      END IF;
      _reverted := 'admin';
    END;

  ELSIF _l.action IN ('item', 'item_delete', 'setting', 'sound_file', 'sound_file_clear', 'sound_settings') THEN
    -- Actions de catalogue et de réglage : on n'a pas l'état précédent
    -- complet, on ne peut pas revenir fidèlement. La console masque
    -- le bouton « Annuler » sur ces lignes — cette branche est atteinte
    -- si jamais un script externe l'appelle quand même.
    RAISE EXCEPTION 'Action « % » non réversible', _l.action;

  ELSE
    RAISE EXCEPTION 'Action inconnue : %', _l.action;
  END IF;

  -- On consigne l'annulation elle-même. C'est ce qui rend la console
  -- audit-able : on voit qui a annulé quoi et quand.
  PERFORM public.log_admin(
    'revert:' || _reverted,
    _l.target,
    jsonb_build_object('reverted_log_id', _l.id, 'original_action', _l.action)
  );

  RETURN _reverted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revert_log_entry(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revert_log_entry(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
