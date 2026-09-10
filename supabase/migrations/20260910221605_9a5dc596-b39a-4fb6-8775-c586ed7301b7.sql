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