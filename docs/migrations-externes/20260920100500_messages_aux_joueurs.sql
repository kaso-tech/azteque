-- Un administrateur peut écrire à un joueur.
--
-- (Migration à appliquer sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- La fiche joueur proposait « 📩 Envoyer un message » sans que rien n'existe
-- derrière. Il n'y avait aucun chemin entre l'administration et un joueur :
-- une suspension tombait sans un mot, une réponse à un signalement n'avait
-- nulle part où aller.
--
-- Le message est DÉLIBÉRÉMENT à sens unique. Ouvrir une correspondance
-- suivie demanderait des fils de discussion, de la modération, une file de
-- réponses à tenir — tout autre chose. Ici : l'administration annonce, le
-- joueur lit, et c'est tout. Un joueur qui veut répondre écrit à l'adresse
-- de contact, comme aujourd'hui.

CREATE TABLE IF NOT EXISTS public.player_messages (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- L'auteur : mis à NULL si son compte disparaît, le message restant lisible
  -- par son destinataire (même choix que `player_reports.resolved_by`).
  sender_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.player_messages ENABLE ROW LEVEL SECURITY;

-- Chacun ne lit que ce qui lui est adressé. L'écriture ne passe que par les
-- fonctions ci-dessous : sans cela, un joueur pourrait s'écrire à lui-même
-- au nom de l'administration, ou réécrire le message qu'il a reçu.
REVOKE ALL ON public.player_messages FROM anon, authenticated;
GRANT SELECT ON public.player_messages TO authenticated;
GRANT ALL ON public.player_messages TO service_role;

DROP POLICY IF EXISTS "Mes messages" ON public.player_messages;
CREATE POLICY "Mes messages" ON public.player_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Ce que la boîte de réception demande : les non-lus d'un joueur, les plus
-- anciens d'abord.
CREATE INDEX IF NOT EXISTS player_messages_non_lus_idx
  ON public.player_messages (user_id, created_at)
  WHERE read_at IS NULL;

/* ------------------------------------------------------------------ */
/* Écrire à un joueur                                                  */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.admin_send_message(_user uuid, _body text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id bigint;
  _texte text := btrim(COALESCE(_body, ''));
BEGIN
  PERFORM public.require_admin();

  IF _texte = '' THEN
    RAISE EXCEPTION 'Message vide';
  END IF;
  IF length(_texte) > 1000 THEN
    RAISE EXCEPTION 'Message trop long (1000 caractères max)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user) THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;

  INSERT INTO public.player_messages (user_id, sender_id, body)
  VALUES (_user, auth.uid(), _texte)
  RETURNING id INTO _id;

  -- Le corps n'est PAS recopié dans le journal : il y serait lisible par tout
  -- administrateur, alors qu'il s'adresse à un joueur. Sa longueur suffit à
  -- dire qu'un message est bien parti.
  PERFORM public.log_admin('message', _user::text,
    jsonb_build_object('message_id', _id, 'longueur', length(_texte)));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_send_message(uuid, text) TO authenticated;

/* ------------------------------------------------------------------ */
/* Les marquer lus                                                     */
/* ------------------------------------------------------------------ */

-- Passe par une fonction plutôt que par une politique UPDATE : un joueur doit
-- pouvoir dire « j'ai lu », pas réécrire ce qu'on lui a envoyé.
CREATE OR REPLACE FUNCTION public.mark_my_messages_read(_ids bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.player_messages
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL
     AND (_ids IS NULL OR id = ANY (_ids));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_messages_read(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_messages_read(bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
