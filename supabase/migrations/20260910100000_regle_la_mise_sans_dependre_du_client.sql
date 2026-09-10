-- Le règlement de la mise (déplacement des jetons, classement) ne se
-- déclenchait QUE depuis un navigateur : `useBetNegotiation.ts` appelle
-- `settle_match` dès qu'il voit `state.phase === "gameEnd"`, mais seulement
-- tant que son propre écran de partie reste monté pour le voir.
--
-- Ça tient pour une victoire ordinaire — le joueur reste sur l'écran de fin
-- de champ. Ça casse pour un abandon : "Quitter la table" déclare le forfait
-- PUIS navigue immédiatement ailleurs (voir match.$id.tsx), démontant l'écran
-- avant même que la réponse du serveur ne fasse passer l'état local à
-- "gameEnd" chez celui qui abandonne. Le règlement ne part donc jamais de son
-- côté ; il ne reste possible que si l'ADVERSAIRE, lui, est encore sur son
-- écran de partie au même moment. Si les deux ont quitté — l'un en
-- abandonnant, l'autre juste après avoir vu qu'il a gagné — la mise ne se
-- règle JAMAIS, alors même que la base sait déjà, correctement, qui a perdu
-- et qui a gagné (`champWinner`, `forfeit`).
--
-- Le correctif fait régler la mise par le SERVEUR, dans le même aller-retour
-- que l'action qui termine le champ (forfait, ou pli qui clôt le troisième
-- tour) — voir match-actions.ts. Plus aucun navigateur n'a besoin de rester
-- ouvert pour que les jetons changent de main.
--
-- `settle_match` reste inchangée pour les joueurs : c'est elle que
-- useBetNegotiation.ts continue d'appeler, en filet de sécurité idempotent
-- (`settled_at` empêche un double règlement). Le corps qui déplace
-- effectivement les jetons est extrait dans `_settle_match_impl`, appelée
-- soit par `settle_match` (après avoir vérifié que l'appelant est bien un des
-- deux participants), soit par la nouvelle `settle_match_as_server` (après
-- avoir vérifié qu'elle est appelée par la clé de service, jamais par un
-- joueur).
--
-- Ce contrôle utilise `current_user`, pas `auth.uid()` ni `auth.role()` — la
-- même prudence que `protect_match_mutable_columns` (voir sa migration), pour
-- la même raison : `auth.role()` lit une revendication JWT qui peut ne rien
-- renvoyer selon le type de clé d'API utilisé, alors que `current_user` est
-- le rôle Postgres réel de la connexion et se vérifie déjà, avec succès, sur
-- cette même table (`matches`) par ce déclencheur. Pour que la vérification
-- porte sur l'appelant réel, `settle_match_as_server` n'est PAS security
-- definer : `SECURITY DEFINER` changerait `current_user`, à l'intérieur de la
-- fonction, pour celui de son propriétaire — c'est justement pour ça que le
-- travail privilégié est délégué à `_settle_match_impl`, appelée une fois
-- l'appelant vérifié.
CREATE OR REPLACE FUNCTION public._settle_match_impl(_match_id uuid)
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
  _winner_tokens integer;
  _loser_tokens integer;
  _rounds integer;
BEGIN
  SELECT * INTO _m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;
  IF _m.settled_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF _m.state IS NULL OR _m.state ->> 'phase' <> 'gameEnd' THEN
    RETURN;
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
    RETURN;
  END IF;

  _rounds := COALESCE((_m.state -> 'roundsWon' ->> 0)::int, 0)
           + COALESCE((_m.state -> 'roundsWon' ->> 1)::int, 0);
  UPDATE public.profiles SET rounds_played = rounds_played + greatest(_rounds, 1)
   WHERE id IN (_winner, _loser);

  PERFORM public.apply_match_rating(_match_id, _winner, _loser);

  IF (_m.settings -> 'bet' ->> 'status') IS DISTINCT FROM 'accepted' THEN
    RETURN;
  END IF;
  _bet := COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0);
  IF _bet <= 0 THEN
    RETURN;
  END IF;

  -- Les deux soldes sont relus ici, au règlement : ils ont pu bouger depuis
  -- l'acceptation de la mise (achat de jetons, autre partie...). Si l'un des
  -- deux ne peut plus couvrir sa part, la mise n'est pas honorée — aucun
  -- jeton ne change de main plutôt qu'un transfert partiel qui ne
  -- refléterait plus l'enjeu accepté par les deux joueurs.
  SELECT tokens INTO _winner_tokens FROM public.profiles WHERE id = _winner;
  SELECT tokens INTO _loser_tokens FROM public.profiles WHERE id = _loser;
  IF COALESCE(_winner_tokens, 0) < _bet OR COALESCE(_loser_tokens, 0) < _bet THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET tokens = tokens - _bet WHERE id IN (_winner, _loser);
  UPDATE public.profiles SET tokens = tokens + (_bet * 2) WHERE id = _winner;
END;
$$;

REVOKE ALL ON FUNCTION public._settle_match_impl(uuid) FROM PUBLIC;

-- Appelée par un JOUEUR (client) : elle vérifie elle-même qu'il participe à
-- la partie avant de déléguer le travail. Comportement inchangé pour
-- useBetNegotiation.ts, qui continue à l'appeler telle quelle.
CREATE OR REPLACE FUNCTION public.settle_match(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = _match_id AND auth.uid() IN (host_id, guest_id)
  ) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette partie';
  END IF;
  PERFORM public._settle_match_impl(_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid) TO authenticated;

-- Appelée par le SERVEUR (match-actions.ts, via la clé de service) juste
-- après avoir écrit l'action qui fait passer le champ en "gameEnd" — forfait
-- ou pli qui clôt le troisième tour. Aucun joueur ne peut l'invoquer : la clé
-- de service n'est jamais exposée au client, et `current_user` ne peut valoir
-- `service_role` que pour une connexion authentifiée comme telle.
CREATE OR REPLACE FUNCTION public.settle_match_as_server(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'settle_match_as_server: service_role only';
  END IF;
  PERFORM public._settle_match_impl(_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match_as_server(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match_as_server(uuid) TO service_role;
