-- Une partie abandonnée se termine seule.
--
-- (Migration appliquée sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- Aujourd'hui, si un joueur ferme son application ou perd sa connexion en
-- pleine partie, la table reste « en cours » pour toujours tant que son
-- adversaire ne déclare pas lui-même l'abandon — ce qu'il ne peut pas faire
-- s'il a quitté l'écran, ou si les deux joueurs sont partis. Le balayage
-- ci-dessous clôt ces parties tout seul : le joueur à qui c'était le tour et
-- qui n'a rien joué depuis le délai est déclaré perdant (raison
-- « disconnect »), exactement comme si son adversaire l'avait fait à sa
-- place. Le règlement passe ensuite par la fonction existante
-- (`_settle_match_impl`) : résultat, manches jouées, classement et mise
-- suivent le chemin normal d'une fin de partie.
--
-- Déclenché en opportuniste depuis les battements de présence
-- (`touch_last_seen`) et la file d'attente (`mm_poll`) : chaque client qui
-- vit fait avancer le ménage, sans tâche planifiée.

CREATE OR REPLACE FUNCTION public.abandon_delai()
RETURNS interval
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT interval '5 minutes';
$$;

CREATE INDEX IF NOT EXISTS matches_abandon_a_balayer
  ON public.matches (updated_at)
  WHERE status = 'playing' AND settled_at IS NULL;

CREATE OR REPLACE FUNCTION public.terminer_parties_abandonnees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _m public.matches;
  _tour int;
  _champ int;
  _finies int := 0;
BEGIN
  FOR _m IN
    SELECT * FROM public.matches
    WHERE status = 'playing'
      AND settled_at IS NULL
      AND host_id IS NOT NULL
      AND guest_id IS NOT NULL
      AND updated_at < now() - public.abandon_delai()
    ORDER BY updated_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF _m.state IS NULL THEN
      -- Table née de la mise en relation mais jamais distribuée : rien à
      -- trancher, rien à payer — on la clôt sans vainqueur.
      UPDATE public.matches
        SET status = 'finished', finished_at = now(), settled_at = now()
        WHERE id = _m.id;
    ELSIF _m.state ->> 'phase' = 'gameEnd' THEN
      -- La partie était finie côté état ; le règlement n'a simplement jamais
      -- eu lieu (tout le monde est parti à ce moment-là).
      PERFORM public._settle_match_impl(_m.id);
    ELSE
      -- Le joueur à qui c'était le tour n'a rien joué depuis le délai :
      -- abandon déclaré contre lui, comme l'aurait fait son adversaire.
      _tour := COALESCE((_m.state ->> 'turn')::int, 0);
      _champ := CASE WHEN _tour = 0 THEN 1 ELSE 0 END;
      UPDATE public.matches
        SET state = jsonb_set(
              jsonb_set(
                jsonb_set(_m.state, '{phase}', '"gameEnd"'::jsonb, true),
                '{champWinner}', to_jsonb(_champ), true),
              '{forfeit}',
              jsonb_build_object('loser', _tour, 'reason', 'disconnect'),
              true)
        WHERE id = _m.id;
      PERFORM public._settle_match_impl(_m.id);
    END IF;
    _finies := _finies + 1;
  END LOOP;
  RETURN _finies;
END;
$function$;

-- Le balayage n'a pas d'appel direct légitime depuis un navigateur : il est
-- emmené par les fonctions de battement redéfinies ci-dessous.
REVOKE ALL ON FUNCTION public.terminer_parties_abandonnees() FROM PUBLIC;

-- Chaque battement de présence fait avancer le ménage.
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.terminer_parties_abandonnees();
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
END;
$function$;

-- La file d'attente aussi, à chaque sondage.
CREATE OR REPLACE FUNCTION public.mm_poll()
RETURNS TABLE(match_id uuid, seat text, devant integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _moi uuid := auth.uid();
  _trouvee uuid;
BEGIN
  IF _moi IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.terminer_parties_abandonnees();

  -- Le battement : tant que le client interroge, sa place est tenue.
  UPDATE public.matchmaking_queue
  SET seen_at = now()
  WHERE user_id = _moi AND public.matchmaking_queue.match_id IS NULL;

  SELECT q.match_id INTO _trouvee
  FROM public.matchmaking_queue q
  WHERE q.user_id = _moi AND q.match_id IS NOT NULL;

  IF _trouvee IS NOT NULL THEN
    DELETE FROM public.matchmaking_queue WHERE user_id = _moi;
    RETURN QUERY
      SELECT _trouvee,
             CASE WHEN m.host_id = _moi THEN 'host' ELSE 'guest' END,
             0
      FROM public.matches m WHERE m.id = _trouvee;
    RETURN;
  END IF;

  -- Toujours en attente : on rend le nombre de joueurs devant soi, de quoi
  -- dire honnêtement s'il se passe quelque chose.
  RETURN QUERY
    SELECT NULL::uuid, NULL::text, (
      SELECT count(*)::integer
      FROM public.matchmaking_queue q
      WHERE q.match_id IS NULL
        AND q.seen_at >= now() - public.mm_peremption()
        AND q.seen_at < (
          SELECT seen_at FROM public.matchmaking_queue WHERE user_id = _moi
        )
    );
END;
$function$;
