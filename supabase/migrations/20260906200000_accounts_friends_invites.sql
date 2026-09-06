-- Comptes joueurs, amis, invitations directes et solde de jetons persistant.
--
-- Jusqu'ici, chaque joueur était un utilisateur anonyme et son solde de jetons
-- vivait dans le stockage local de son navigateur. Cette migration introduit
-- de vrais comptes : un pseudo unique qui sert à se retrouver, une liste
-- d'amis, des invitations à jouer sans code, et un solde conservé côté
-- serveur — donc infalsifiable depuis le client.

-- Pseudo insensible à la casse : « Kofi » et « kofi » désignent le même joueur.
CREATE EXTENSION IF NOT EXISTS citext;

/* ------------------------------------------------------------------ */
/* Profils                                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username citext NOT NULL UNIQUE,
  tokens integer NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  -- Le solde local d'un navigateur ne peut créditer qu'un seul compte.
  claimed_local_tokens boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_-]{3,20}$')
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Le solde n'est JAMAIS écrit par le client : seules les fonctions de
-- règlement ci-dessous y touchent. Le privilège de colonne l'impose au
-- niveau du moteur, indépendamment des policies.
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, username) ON public.profiles TO authenticated;
GRANT UPDATE (username, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Profils visibles des joueurs connectés" ON public.profiles;
-- La recherche par pseudo impose de pouvoir lire les autres profils.
CREATE POLICY "Profils visibles des joueurs connectés" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Chacun crée son profil" ON public.profiles;
CREATE POLICY "Chacun crée son profil" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Chacun modifie son profil" ON public.profiles;
CREATE POLICY "Chacun modifie son profil" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/* ------------------------------------------------------------------ */
/* Amitiés                                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.friendships (
  requester_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CONSTRAINT friendships_distinct CHECK (requester_id <> addressee_id)
);

-- Une seule relation par paire, quel que soit celui qui a demandé : sans cet
-- index, A→B et B→A coexisteraient et l'on verrait deux fois le même ami.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair ON public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendships FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

DROP POLICY IF EXISTS "Voir ses propres liens" ON public.friendships;
CREATE POLICY "Voir ses propres liens" ON public.friendships FOR SELECT TO authenticated
USING (auth.uid() IN (requester_id, addressee_id));

DROP POLICY IF EXISTS "Demander en ami" ON public.friendships;
CREATE POLICY "Demander en ami" ON public.friendships FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid() AND status = 'pending');

-- Seul le destinataire accepte ; il ne peut pas se transformer en demandeur.
DROP POLICY IF EXISTS "Accepter une demande reçue" ON public.friendships;
CREATE POLICY "Accepter une demande reçue" ON public.friendships FOR UPDATE TO authenticated
USING (addressee_id = auth.uid())
WITH CHECK (addressee_id = auth.uid());

DROP POLICY IF EXISTS "Retirer un lien" ON public.friendships;
CREATE POLICY "Retirer un lien" ON public.friendships FOR DELETE TO authenticated
USING (auth.uid() IN (requester_id, addressee_id));

/* ------------------------------------------------------------------ */
/* Invitations à jouer                                                 */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_invites_distinct CHECK (from_id <> to_id)
);

CREATE INDEX IF NOT EXISTS game_invites_to_pending ON public.game_invites (to_id, status);

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_invites FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.game_invites TO authenticated;
GRANT ALL ON public.game_invites TO service_role;

DROP POLICY IF EXISTS "Voir ses invitations" ON public.game_invites;
CREATE POLICY "Voir ses invitations" ON public.game_invites FOR SELECT TO authenticated
USING (auth.uid() IN (from_id, to_id));

DROP POLICY IF EXISTS "Inviter à jouer" ON public.game_invites;
CREATE POLICY "Inviter à jouer" ON public.game_invites FOR INSERT TO authenticated
WITH CHECK (from_id = auth.uid() AND status = 'pending');

-- L'invité refuse, l'hôte annule. L'acceptation passe par la fonction
-- accept_game_invite, qui inscrit aussi l'invité dans la partie.
DROP POLICY IF EXISTS "Répondre à une invitation" ON public.game_invites;
CREATE POLICY "Répondre à une invitation" ON public.game_invites FOR UPDATE TO authenticated
USING (auth.uid() IN (from_id, to_id))
WITH CHECK (status IN ('declined', 'cancelled'));

ALTER TABLE public.game_invites REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

/* ------------------------------------------------------------------ */
/* Résultats de partie                                                 */
/* ------------------------------------------------------------------ */

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

CREATE INDEX IF NOT EXISTS matches_finished ON public.matches (winner_id, finished_at)
WHERE winner_id IS NOT NULL;

/* ------------------------------------------------------------------ */
/* Fonctions                                                           */
/* ------------------------------------------------------------------ */

-- Rejoindre une partie sur invitation, sans code. Inscrit l'invité dans la
-- partie et clôt l'invitation d'un seul geste.
CREATE OR REPLACE FUNCTION public.accept_game_invite(_invite_id uuid)
RETURNS SETOF public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite public.game_invites;
  _name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _invite FROM public.game_invites
  WHERE id = _invite_id AND to_id = auth.uid() AND status = 'pending'
  FOR UPDATE;

  IF _invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation introuvable ou déjà traitée';
  END IF;

  SELECT username INTO _name FROM public.profiles WHERE id = auth.uid();

  UPDATE public.game_invites SET status = 'accepted' WHERE id = _invite.id;

  RETURN QUERY
  UPDATE public.matches
  SET guest_id = auth.uid(),
      guest_name = COALESCE(_name, 'Invité'),
      status = 'playing'
  WHERE id = _invite.match_id
    AND status = 'waiting'
    AND guest_id IS NULL
    AND host_id IS DISTINCT FROM auth.uid()
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_game_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_game_invite(uuid) TO authenticated;

-- Report unique du solde accumulé dans le navigateur avant l'ouverture d'un
-- compte. Plafonné, et utilisable une seule fois par compte.
CREATE OR REPLACE FUNCTION public.claim_local_tokens(_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
  SET tokens = tokens + least(greatest(COALESCE(_amount, 0), 0), 100000),
      claimed_local_tokens = true
  WHERE id = auth.uid() AND claimed_local_tokens = false
  RETURNING tokens INTO _new;

  IF _new IS NULL THEN
    SELECT tokens INTO _new FROM public.profiles WHERE id = auth.uid();
  END IF;
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_local_tokens(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_local_tokens(integer) TO authenticated;

-- Règlement de la mise en fin de champ.
--
-- C'est le serveur qui lit le vainqueur dans l'état de partie et déplace les
-- jetons : le client ne peut donc pas s'en attribuer. L'opération est
-- idempotente (`settled_at`), de sorte que les deux joueurs peuvent l'appeler
-- sans risque de double comptage.
--
-- Cette fonction ne touche ni `state` ni `settings` : le déclencheur
-- protect_match_mutable_columns, qui n'autorise que service_role sur ces deux
-- colonnes, n'est donc pas déclenché.
CREATE OR REPLACE FUNCTION public.settle_match(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.matches;
  _champ int;
  _winner uuid;
  _loser uuid;
  _bet integer;
  _moved integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;
  IF auth.uid() NOT IN (_m.host_id, _m.guest_id) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette partie';
  END IF;
  IF _m.settled_at IS NOT NULL THEN
    RETURN; -- déjà réglée
  END IF;
  IF _m.state IS NULL OR _m.state ->> 'phase' <> 'gameEnd' THEN
    RETURN; -- le champ n'est pas terminé
  END IF;

  _champ := (_m.state ->> 'champWinner')::int;
  IF _champ IS NULL THEN
    RETURN;
  END IF;
  _winner := CASE WHEN _champ = 0 THEN _m.host_id ELSE _m.guest_id END;
  _loser := CASE WHEN _champ = 0 THEN _m.guest_id ELSE _m.host_id END;

  UPDATE public.matches
  SET winner_id = _winner, finished_at = now(), settled_at = now(), status = 'finished'
  WHERE id = _match_id;

  IF _winner IS NULL OR _loser IS NULL THEN
    RETURN; -- adversaire parti : résultat enregistré, rien à transférer
  END IF;

  IF (_m.settings -> 'bet' ->> 'status') IS DISTINCT FROM 'accepted' THEN
    RETURN;
  END IF;
  _bet := COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0);
  IF _bet <= 0 THEN
    RETURN;
  END IF;

  -- On ne prend jamais plus que ce que le perdant possède.
  SELECT least(_bet, tokens) INTO _moved FROM public.profiles WHERE id = _loser;
  _moved := COALESCE(_moved, 0);
  IF _moved <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET tokens = tokens - _moved WHERE id = _loser;
  UPDATE public.profiles SET tokens = tokens + _moved WHERE id = _winner;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid) TO authenticated;

-- Récompense d'une victoire contre l'IA. Le montant dépend du niveau
-- affronté ; il est fixé ici pour que le client ne puisse pas le choisir.
CREATE OR REPLACE FUNCTION public.award_ai_win(_difficulty text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reward integer;
  _new integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _reward := CASE _difficulty
    WHEN 'facile' THEN 50
    WHEN 'normal' THEN 100
    WHEN 'expert' THEN 150
    WHEN 'maitre' THEN 200
    WHEN 'legende' THEN 250
    ELSE 0
  END;
  IF _reward = 0 THEN
    RAISE EXCEPTION 'Niveau inconnu';
  END IF;

  UPDATE public.profiles SET tokens = tokens + _reward
  WHERE id = auth.uid()
  RETURNING tokens INTO _new;
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.award_ai_win(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_ai_win(text) TO authenticated;
