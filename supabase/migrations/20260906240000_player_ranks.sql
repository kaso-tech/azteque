-- Classement des joueurs : cote Elo et grades.
--
-- Le grade ne se calcule pas ici : il se déduit de la cote par des seuils
-- fixes, décrits une seule fois côté client (src/lib/azteque/rank.ts). La base
-- ne connaît donc qu'un nombre, ce qui évite d'avoir à tenir deux barèmes en
-- accord. Seul le palier de 2000 apparaît ci-dessous, pour tempérer la cote
-- des meilleurs joueurs.
--
-- La cote suit la formule d'Elo, qui répond exactement à ce qu'on attend d'un
-- classement : l'écart de cote donne la probabilité de gagner, et l'on ne
-- gagne ou ne perd que l'écart entre le résultat et cette attente. Battre plus
-- fort que soi rapporte beaucoup, battre plus faible presque rien ; perdre
-- contre plus faible que soi coûte le maximum. La rétrogradation en découle
-- sans règle supplémentaire : la cote passe sous le seuil, le grade suit.
--
-- Seules les parties en ligne entre deux comptes sont classées. Une victoire
-- contre l'IA est annoncée par le client, qui pourrait l'inventer : la faire
-- compter viderait le classement de son sens. Elle continue de rapporter des
-- jetons, pas de la cote.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS peak_rating integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS rated_games integer NOT NULL DEFAULT 0;

-- Ce que chacun a gagné ou perdu sur cette partie : la table en garde la trace
-- pour l'afficher en fin de champ, et le client n'a pas à la recalculer.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS rating_delta_host integer,
  ADD COLUMN IF NOT EXISTS rating_delta_guest integer;

-- Le client ne peut écrire ni la cote ni le nombre de parties classées : ces
-- colonnes ne figurent pas dans le GRANT UPDATE de profiles, qui reste limité
-- à `username` et `updated_at`.

/* ------------------------------------------------------------------ */
/* Barème                                                              */
/* ------------------------------------------------------------------ */

-- Coefficient K : l'amplitude maximale d'un résultat.
--
-- Élevé au début, le temps que la cote rejoigne le niveau réel du joueur ;
-- resserré ensuite ; plus resserré encore au sommet, où une cote doit se
-- mériter sur la durée et non sur un coup de chance.
CREATE OR REPLACE FUNCTION public.elo_k(_rated_games integer, _rating integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(_rated_games, 0) < 10 THEN 40  -- rodage
    WHEN COALESCE(_rating, 1000) >= 2000 THEN 16 -- Grand Maître et au-delà
    ELSE 24
  END;
$$;

-- Plancher : on ne descend pas indéfiniment. Un débutant qui enchaîne les
-- défaites reste au bas du premier grade au lieu de creuser un trou dont il
-- lui faudrait des dizaines de victoires pour sortir.
CREATE OR REPLACE FUNCTION public.rating_floor()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 800 $$;

/* ------------------------------------------------------------------ */
/* Application du résultat                                             */
/* ------------------------------------------------------------------ */

-- Met à jour les deux cotes d'un champ terminé.
--
-- Appelée par settle_match uniquement, qui tient déjà le verrou sur la partie
-- et n'agit qu'une fois (`settled_at`) : le double comptage est exclu.
CREATE OR REPLACE FUNCTION public.apply_match_rating(
  _match_id uuid, _winner uuid, _loser uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rw integer; _rl integer;      -- cotes avant
  _gw integer; _gl integer;      -- parties classées avant
  _expected numeric;             -- espérance de gain du vainqueur
  _dw integer; _dl integer;      -- variations effectives
  _nw integer; _nl integer;      -- cotes après
BEGIN
  SELECT rating, rated_games INTO _rw, _gw FROM public.profiles WHERE id = _winner FOR UPDATE;
  SELECT rating, rated_games INTO _rl, _gl FROM public.profiles WHERE id = _loser FOR UPDATE;
  IF _rw IS NULL OR _rl IS NULL THEN
    RETURN; -- l'un des deux n'a pas de profil : partie non classée
  END IF;

  _expected := 1.0 / (1.0 + power(10.0, (_rl - _rw) / 400.0));

  -- Un point au moins change de main dans les deux sens : sans ce minimum,
  -- battre beaucoup plus faible que soi ne se verrait pas du tout, et le
  -- joueur croirait le classement en panne.
  --
  -- L'espérance du perdant est le complément de celle du vainqueur : c'est
  -- elle, et non celle du vainqueur, qui mesure ce qu'il vient de manquer.
  -- Confondre les deux rendrait indolore la défaite contre plus faible que
  -- soi, à rebours de tout l'intérêt du classement.
  _dw := greatest(1, round(public.elo_k(_gw, _rw) * (1 - _expected)))::integer;
  _dl := least(-1, round(public.elo_k(_gl, _rl) * (_expected - 1)))::integer;

  _nw := _rw + _dw;
  _nl := greatest(public.rating_floor(), _rl + _dl);
  -- Le plancher peut absorber une partie de la perte : on affiche alors ce qui
  -- a réellement été retiré, et non ce qui aurait dû l'être.
  _dl := _nl - _rl;

  UPDATE public.profiles
     SET rating = _nw,
         peak_rating = greatest(peak_rating, _nw),
         rated_games = rated_games + 1
   WHERE id = _winner;

  UPDATE public.profiles
     SET rating = _nl,
         rated_games = rated_games + 1
   WHERE id = _loser;

  UPDATE public.matches
     SET rating_delta_host = CASE WHEN host_id = _winner THEN _dw ELSE _dl END,
         rating_delta_guest = CASE WHEN guest_id = _winner THEN _dw ELSE _dl END
   WHERE id = _match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_rating(uuid, uuid, uuid) FROM PUBLIC;

-- settle_match reprend à l'identique, avec le classement inséré juste après
-- l'enregistrement du vainqueur : la cote doit bouger même sans mise, alors
-- que la suite de la fonction s'arrête dès qu'il n'y a rien à transférer.
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
    RETURN; -- adversaire parti : résultat enregistré, rien à classer ni à transférer
  END IF;

  -- Le classement ne dépend pas de la mise : un champ joué sans jetons compte
  -- autant qu'un autre.
  PERFORM public.apply_match_rating(_match_id, _winner, _loser);

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

NOTIFY pgrst, 'reload schema';
