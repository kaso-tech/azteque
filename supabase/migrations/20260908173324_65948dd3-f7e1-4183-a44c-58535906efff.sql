-- Console d'administration v2 — PR5 : Parties.
--
-- La console a besoin de voir les parties (filtres riches, pagination) et
-- d'agir sur les parties litigieuses (annulation, forçage du résultat).
-- Trois RPC :
--
-- 1. `admin_list_matches(_status, _since, _until, _host, _guest, _limit,
--    _offset)` retourne les parties avec leur compte de tours, leur
--    état, et le delta de cote appliqué. Filtres : statut (en cours,
--    terminée, en litige), période, joueurs impliqués.
--
-- 2. `admin_match_void(_id, _reason)` annule une partie : remet winner_id
--    à NULL, settled_at à NULL, et restaure les jetons misés s'il y
--    avait un pari accepté. Le but est de corriger un résultat erroné
--    sans avoir à toucher la table directement. La cote déjà appliquée
--    n'est pas restaurée : c'est une décision de politique (Elo se
--    recalcule au match suivant, c'est plus sain qu'un rollback).
--
-- 3. `admin_match_forfeit(_id, _winner_id, _reason)` désigne un
--    gagnant par forfait. C'est l'inverse : on a un match où un joueur
--    a quitté, et l'arbitre désigne le vainqueur. Met à jour winner_id
--    et settled_at, applique le delta de cote (positif pour le
--    gagnant, négatif pour le perdant), transfère les jetons misés.
--
-- Les deux fonctions `void` et `forfeit` consignent au journal
-- d'audit, comme toute action d'administration.

/* ------------------------------------------------------------------ */
/* Liste filtrée et paginée                                            */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_list_matches(text, timestamptz, timestamptz, uuid, uuid, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_matches(
  _status text DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _host uuid DEFAULT NULL,
  _guest uuid DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  code text,
  host_id uuid,
  host_username text,
  guest_id uuid,
  guest_username text,
  winner_id uuid,
  status text,
  rounds_host int,
  rounds_guest int,
  bet_amount int,
  rating_delta_host int,
  rating_delta_guest int,
  finished_at timestamptz,
  settled_at timestamptz,
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
    m.id,
    m.code,
    m.host_id,
    hp.username AS host_username,
    m.guest_id,
    gp.username AS guest_username,
    m.winner_id,
    CASE
      WHEN m.settled_at IS NOT NULL THEN 'finished'::text
      WHEN m.finished_at IS NOT NULL THEN 'settled'::text
      WHEN m.guest_id IS NULL THEN 'waiting'::text
      ELSE 'playing'::text
    END AS status,
    COALESCE((m.state -> 'roundsWon' ->> 0)::int, 0) AS rounds_host,
    COALESCE((m.state -> 'roundsWon' ->> 1)::int, 0) AS rounds_guest,
    COALESCE((m.settings -> 'bet' ->> 'amount')::int, 0) AS bet_amount,
    COALESCE(m.rating_delta_host, 0) AS rating_delta_host,
    COALESCE(m.rating_delta_guest, 0) AS rating_delta_guest,
    m.finished_at,
    m.settled_at,
    m.created_at
  FROM public.matches m
  LEFT JOIN public.profiles hp ON hp.id = m.host_id
  LEFT JOIN public.profiles gp ON gp.id = m.guest_id
  WHERE
    (_status IS NULL OR (
      (_status = 'finished' AND m.settled_at IS NOT NULL) OR
      (_status = 'playing' AND m.settled_at IS NULL AND m.finished_at IS NULL AND m.guest_id IS NOT NULL) OR
      (_status = 'waiting' AND m.settled_at IS NULL AND m.finished_at IS NULL AND m.guest_id IS NULL) OR
      (_status = 'all')
    ))
    AND (_since IS NULL OR m.created_at >= _since)
    AND (_until IS NULL OR m.created_at < _until)
    AND (_host IS NULL OR m.host_id = _host)
    AND (_guest IS NULL OR m.guest_id = _guest)
  ORDER BY COALESCE(m.settled_at, m.finished_at, m.created_at) DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_matches(text, timestamptz, timestamptz, uuid, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_matches(text, timestamptz, timestamptz, uuid, uuid, int, int) TO authenticated;

/* ------------------------------------------------------------------ */
/* Annulation d'une partie                                             */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_match_void(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_match_void(_id uuid, _reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.matches;
BEGIN
  PERFORM public.require_admin();
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;

  SELECT * INTO _m FROM public.matches WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;
  IF _m.settled_at IS NULL THEN
    RAISE EXCEPTION 'Partie non terminée, à finir plutôt qu''annuler';
  END IF;

  -- On remet les compteurs à zéro. La cote déjà appliquée n'est pas
  -- restaurée — c'est une décision explicite : Elo se recalcule au
  -- match suivant, et un rollback complet créerait des incohérences
  -- dans la série historique du joueur.
  UPDATE public.matches
    SET winner_id = NULL,
        finished_at = NULL,
        settled_at = NULL,
        status = 'pending'
  WHERE id = _id;

  -- On rend la mise aux deux joueurs, parce qu'on annule le résultat
  -- qui les avait fait transiter.
  IF (_m.settings -> 'bet' ->> 'status') = 'accepted' THEN
    DECLARE
      _bet int := COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0);
    BEGIN
      IF _bet > 0 AND _m.host_id IS NOT NULL THEN
        UPDATE public.profiles SET tokens = tokens + _bet WHERE id = _m.host_id;
      END IF;
      IF _bet > 0 AND _m.guest_id IS NOT NULL THEN
        UPDATE public.profiles SET tokens = tokens + _bet WHERE id = _m.guest_id;
      END IF;
    END;
  END IF;

  PERFORM public.log_admin(
    'match_void',
    _id::text,
    jsonb_build_object('reason', COALESCE(_reason, ''), 'restored_bet', COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_match_void(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_match_void(uuid, text) TO authenticated;

/* ------------------------------------------------------------------ */
/* Forfait : désigner un gagnant                                       */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_match_forfeit(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_match_forfeit(
  _id uuid,
  _winner_id uuid,
  _reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.matches;
  _loser uuid;
  _bet int := 0;
  _new_balance int;
BEGIN
  PERFORM public.require_admin();
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;

  SELECT * INTO _m FROM public.matches WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'Partie introuvable';
  END IF;
  IF _m.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Partie déjà terminée';
  END IF;
  IF _winner_id NOT IN (_m.host_id, _m.guest_id) THEN
    RAISE EXCEPTION 'Le gagnant doit être l''un des deux joueurs';
  END IF;
  IF _m.host_id IS NULL OR _m.guest_id IS NULL THEN
    RAISE EXCEPTION 'Partie incomplète : un joueur manque';
  END IF;

  _loser := CASE WHEN _winner_id = _m.host_id THEN _m.guest_id ELSE _m.host_id END;

  UPDATE public.matches
    SET winner_id = _winner_id,
        finished_at = now(),
        settled_at = now(),
        status = 'finished'
  WHERE id = _id;

  -- Mise : on transfère au gagnant.
  IF (_m.settings -> 'bet' ->> 'status') = 'accepted' THEN
    _bet := COALESCE((_m.settings -> 'bet' ->> 'amount')::int, 0);
    IF _bet > 0 THEN
      UPDATE public.profiles
        SET tokens = greatest(0, tokens - _bet)
        WHERE id = _loser;
      UPDATE public.profiles
        SET tokens = tokens + _bet
        WHERE id = _winner_id
        RETURNING tokens INTO _new_balance;
    END IF;
  END IF;

  PERFORM public.log_admin(
    'match_forfeit',
    _id::text,
    jsonb_build_object('winner_id', _winner_id, 'loser_id', _loser, 'reason', COALESCE(_reason, ''), 'bet', _bet)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_match_forfeit(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_match_forfeit(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';