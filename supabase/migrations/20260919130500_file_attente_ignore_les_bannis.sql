-- La file d'attente ne protégeait pas contre un compte suspendu.
--
-- Voir `20260919130000_bannissement_couvre_les_deux_sieges.sql` pour le
-- déclencheur qui refuse désormais une table dont l'invité est banni, pas
-- seulement l'hôte. Ce déclencheur suffit à empêcher la partie de naître,
-- mais laissé seul il produit un mauvais résultat ici précisément : quand
-- `mm_join` apparie un compte banni resté en file avec un joueur qui vient
-- d'arriver, c'est l'INSERT dans `matches` qui échoue — donc l'appel de la
-- VICTIME, qui reçoit une erreur « Compte suspendu » qui ne parle pas de son
-- propre compte, sans avoir été inscrite en file pour autant. Elle reste
-- bloquée jusqu'à ce que le compte banni expire de la file (45 s).
--
-- On ferme donc le trou à la source, à deux endroits :
-- 1. Un compte banni qui appelle `mm_join` l'apprend tout de suite, avant
--    d'occuper une place.
-- 2. Un compte banni déjà en file, mis là avant d'être suspendu, n'est
--    jamais choisi comme partenaire.
--
-- Le déclencheur reste en place : c'est lui qui protège les autres chemins
-- (rejoindre par code, revanche) que ce module ne touche pas.

CREATE OR REPLACE FUNCTION public.mm_join()
RETURNS TABLE(match_id uuid, seat text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moi uuid := auth.uid();
  _mon_pseudo text;
  _je_suis_banni boolean;
  _autre uuid;
  _son_pseudo text;
  _code text;
  _nouvelle uuid;
BEGIN
  IF _moi IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT username, banned INTO _mon_pseudo, _je_suis_banni
  FROM public.profiles WHERE id = _moi;
  IF _mon_pseudo IS NULL THEN
    RAISE EXCEPTION 'Choisissez un pseudo avant de jouer en ligne.';
  END IF;
  IF _je_suis_banni THEN
    RAISE EXCEPTION 'Compte suspendu';
  END IF;

  -- Une table déjà trouvée pour nous : on la rend plutôt que d'en chercher
  -- une seconde. Cas d'un client qui redemande après un aller-retour perdu.
  SELECT q.match_id INTO _nouvelle
  FROM public.matchmaking_queue q
  WHERE q.user_id = _moi AND q.match_id IS NOT NULL;
  IF _nouvelle IS NOT NULL THEN
    DELETE FROM public.matchmaking_queue WHERE user_id = _moi;
    RETURN QUERY
      SELECT _nouvelle,
             CASE WHEN m.host_id = _moi THEN 'host' ELSE 'guest' END
      FROM public.matches m WHERE m.id = _nouvelle;
    RETURN;
  END IF;

  -- À partir d'ici, un seul appariement à la fois. Le verrou est tenu jusqu'à
  -- la fin de la transaction, donc relâché quoi qu'il arrive. Voir l'en-tête
  -- de `file_attente.sql` pour la course qu'il ferme.
  PERFORM pg_advisory_xact_lock(hashtext('azteque.matchmaking'));

  -- Ménage opportuniste : les lignes sans battement depuis trop longtemps.
  DELETE FROM public.matchmaking_queue
  WHERE match_id IS NULL AND seen_at < now() - public.mm_peremption();

  -- Le plus ancien qui attend vraiment, ET qui a le droit de jouer.
  SELECT q.user_id INTO _autre
  FROM public.matchmaking_queue q
  JOIN public.profiles p ON p.id = q.user_id
  WHERE q.user_id <> _moi
    AND q.match_id IS NULL
    AND q.seen_at >= now() - public.mm_peremption()
    AND NOT p.banned
  ORDER BY q.seen_at
  LIMIT 1;

  IF _autre IS NULL THEN
    -- Personne : on prend (ou reprend) sa place dans la file.
    INSERT INTO public.matchmaking_queue (user_id, seen_at)
    VALUES (_moi, now())
    ON CONFLICT (user_id) DO UPDATE SET seen_at = now();
    RETURN;
  END IF;

  SELECT username INTO _son_pseudo FROM public.profiles WHERE id = _autre;

  -- Code de table, même alphabet que le reste du jeu : ni O ni 0, ni I ni 1.
  LOOP
    _code := (
      SELECT string_agg(
        substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + floor(random() * 32)::int, 1), '')
      FROM generate_series(1, 5)
    );
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.matches WHERE code = _code);
  END LOOP;

  -- Celui qui attendait devient l'hôte : c'est lui qui distribuera, et il a
  -- patienté. La table naît en jeu, sans état ni mise, comme une table qu'on
  -- vient de rejoindre — les deux s'accordent sur la mise, puis l'hôte donne.
  INSERT INTO public.matches (code, host_id, host_name, guest_id, guest_name, status)
  VALUES (_code, _autre, COALESCE(_son_pseudo, 'Hôte'), _moi, _mon_pseudo, 'playing')
  RETURNING id INTO _nouvelle;

  -- On la laisse à celui qui attend : c'est ainsi qu'il l'apprendra.
  UPDATE public.matchmaking_queue
  SET match_id = _nouvelle
  WHERE user_id = _autre;

  DELETE FROM public.matchmaking_queue WHERE user_id = _moi;

  RETURN QUERY SELECT _nouvelle, 'guest'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.mm_join() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mm_join() TO authenticated;
