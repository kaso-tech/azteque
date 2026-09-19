-- Une partie abandonnée par les DEUX joueurs à la fois restait bloquée à
-- jamais dans le statut « en cours ».
--
-- Le dépassement de temps se règle déjà tout seul quand au moins un des deux
-- navigateurs reste ouvert : 30 secondes de réflexion sans réponse
-- (`TURN_LIMIT`, `useTurnCountdown`), ou 60 secondes de liaison perdue
-- (`LINK_WAIT_LIMIT`, attente-lien.ts) suffisent à celui qui reste présent
-- pour déclarer l'adversaire perdant — le serveur vérifie lui-même, à partir
-- de `updated_at`, que ce délai est bien écoulé avant d'accepter le verdict
-- (voir `resolveForfeit` / match-actions.ts). Mais ce mécanisme est TOUT
-- ENTIER porté par un navigateur ouvert qui observe et déclare : si les deux
-- joueurs partent en même temps — l'un ferme l'onglet pendant que l'autre
-- réfléchit encore, ou les deux quittent avant que quiconque n'ait eu le
-- temps de constater le dépassement — personne n'envoie jamais ce verdict, et
-- la ligne reste « playing » pour toujours. Elle bloque au passage tout
-- retour à la recherche d'un nouvel adversaire, puisque `myOpenMatch` la
-- retrouve indéfiniment (voir online.tsx : le bouton « Chercher un
-- adversaire » ne s'affiche que si `!openMatch`).
--
-- Un abandon en fin de tour (roundEnd, en attente que les deux joueurs
-- confirment vouloir continuer) n'a lui-même AUCUN dépassement de temps
-- existant : le décompte de réflexion ne court que pendant `phase =
-- 'playing'`. Un joueur qui ne revient jamais confirmer bloque donc déjà la
-- partie aujourd'hui, live ou pas.
--
-- Pas besoin de tâche planifiée pour reboucler là-dessus : `my_open_match()`,
-- appelée au chargement du salon (voir online.ts), applique le verdict à la
-- demande, dès qu'un des deux joueurs revient consulter sa partie ouverte —
-- sur le modèle de `mm_join`, qui purge la file d'attente en passant plutôt
-- que par une tâche à part.
--
-- Le seuil (2 minutes) est volontairement plus large que les délais réels
-- (30 s / 60 s) : tant qu'un navigateur reste ouvert, c'est LUI qui tranche,
-- plus vite et avec le contexte du direct. Ce filet n'intervient que quand
-- personne n'a eu l'occasion de le faire, et laisse largement le temps à un
-- retour rapide (« Reprendre la partie ») de reprendre la main avant de se
-- déclencher — passé ce délai, la partie n'est plus « permanente » : elle se
-- referme d'elle-même et rend la main.

CREATE OR REPLACE FUNCTION public.match_inactivity_limit()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$ SELECT interval '120 seconds' $$;

REVOKE ALL ON FUNCTION public.match_inactivity_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_inactivity_limit() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_open_match()
RETURNS SETOF public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moi uuid := auth.uid();
  _m public.matches;
  _tour int;
BEGIN
  IF _moi IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _m FROM public.matches
  WHERE (host_id = _moi OR guest_id = _moi)
    AND status IN ('waiting', 'playing')
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _m.id IS NULL THEN
    RETURN; -- pas de partie ouverte
  END IF;

  IF now() - _m.updated_at < public.match_inactivity_limit() THEN
    RETURN QUERY SELECT * FROM public.matches WHERE id = _m.id;
    RETURN;
  END IF;

  -- Silencieuse depuis trop longtemps : personne n'est resté pour constater
  -- et déclarer l'issue normale. On tranche nous-mêmes, avec les mêmes
  -- règles que le dépassement de réflexion quand elles s'appliquent sans
  -- ambiguïté, et sans donner tort à personne dans le cas contraire.
  IF _m.state IS NOT NULL
     AND (_m.state ->> 'phase') = 'playing'
     AND jsonb_array_length(COALESCE(_m.state -> 'trick', '[]'::jsonb)) < 2
     AND jsonb_array_length(COALESCE(_m.state -> 'drawPending', '[]'::jsonb)) = 0
  THEN
    -- C'est le tour de quelqu'un, sans ambiguïté : mêmes règles qu'un
    -- dépassement de réflexion en direct (`resolveForfeit`, reason
    -- "timeout") — celui à qui c'était le tour perd, et le règlement (mise,
    -- cote) suit comme pour un abandon ordinaire.
    _tour := (_m.state ->> 'turn')::int;
    UPDATE public.matches
    SET state = _m.state
      || jsonb_build_object('phase', 'gameEnd')
      || jsonb_build_object('champWinner', CASE WHEN _tour = 0 THEN 1 ELSE 0 END)
      || jsonb_build_object('forfeit', jsonb_build_object('loser', _tour, 'reason', 'timeout'))
    WHERE id = _m.id;
    PERFORM public._settle_match_impl(_m.id);
  ELSE
    -- Distribution, résolution d'un pli, pioche en attente, ou fin de tour en
    -- attente que les deux confirment vouloir continuer : personne n'est
    -- clairement « au tour », donc personne ne doit payer. On referme sans
    -- vainqueur ni mouvement de jetons — la mise n'est de toute façon jamais
    -- prélevée avant le règlement (voir `_settle_match_impl`).
    UPDATE public.matches
    SET status = 'finished', finished_at = now(), settled_at = now()
    WHERE id = _m.id;
  END IF;

  RETURN; -- la partie n'est plus ouverte : rien à reprendre
END;
$$;

REVOKE ALL ON FUNCTION public.my_open_match() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_open_match() TO authenticated;
