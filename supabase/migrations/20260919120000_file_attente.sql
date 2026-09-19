-- File d'attente automatique : trouver un adversaire sans invitation.
--
-- Jusqu'ici, jouer en ligne supposait de connaître quelqu'un — une invitation
-- à un ami, ou un code échangé de la main à la main. Un joueur qui se connecte
-- seul n'a donc personne à affronter, ce qui est le vrai frein d'une petite
-- communauté : chacun attend que l'autre propose.
--
-- L'appariement doit être ATOMIQUE, et le piège est subtil. Si A et B appellent
-- la fonction au même instant, chacun peut voir l'autre en attente, créer SA
-- table et y inscrire l'autre : deux tables naissent, et les deux joueurs
-- s'assoient chacun à la sienne, face à un adversaire qui n'arrivera jamais.
-- Verrouiller la ligne choisie ne suffit pas, puisque A et B en verrouillent
-- deux différentes.
--
-- On sérialise donc tout l'appariement par un verrou consultatif. Apparier
-- prend quelques microsecondes et n'arrive qu'à l'entrée dans la file : la
-- contention est sans objet, même très au-delà de la taille actuelle, et la
-- justesse ne se discute pas.

/* ------------------------------------------------------------------ */
/* La file                                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Rafraîchi à chaque interrogation du client : c'est le battement de cœur
  -- qui distingue un joueur qui attend d'un joueur dont l'application est
  -- fermée depuis dix minutes.
  seen_at timestamptz NOT NULL DEFAULT now(),
  -- La table trouvée, une fois l'appariement fait. L'autre joueur l'y inscrit
  -- pour celui qui attendait ; c'est ainsi que ce dernier l'apprend.
  match_id uuid REFERENCES public.matches (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recherche du plus ancien en attente : l'index sert l'ordre ET le filtre.
CREATE INDEX IF NOT EXISTS matchmaking_queue_attente
  ON public.matchmaking_queue (seen_at)
  WHERE match_id IS NULL;

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Personne ne lit ni n'écrit cette table directement : tout passe par les
-- trois fonctions ci-dessous, qui seules savent apparier sans casser
-- l'atomicité. Aucune policy n'est donc ouverte au client.
GRANT ALL ON public.matchmaking_queue TO service_role;

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

-- Au-delà de ce délai sans battement, une ligne d'attente est tenue pour
-- abandonnée : l'application a été fermée, l'onglet endormi, le réseau coupé.
-- Généreux à dessein — un téléphone qui s'assoupit une demi-minute ne doit pas
-- faire perdre sa place à son propriétaire.
CREATE OR REPLACE FUNCTION public.mm_peremption()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '45 seconds' $$;

/* ------------------------------------------------------------------ */
/* Entrer dans la file, et s'apparier si quelqu'un attend               */
/* ------------------------------------------------------------------ */

-- Renvoie la table trouvée, ou aucune ligne si l'on entre en attente.
CREATE OR REPLACE FUNCTION public.mm_join()
RETURNS TABLE(match_id uuid, seat text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moi uuid := auth.uid();
  _mon_pseudo text;
  _autre uuid;
  _son_pseudo text;
  _code text;
  _nouvelle uuid;
BEGIN
  IF _moi IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT username INTO _mon_pseudo FROM public.profiles WHERE id = _moi;
  IF _mon_pseudo IS NULL THEN
    RAISE EXCEPTION 'Choisissez un pseudo avant de jouer en ligne.';
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
  -- pour la course qu'il ferme.
  PERFORM pg_advisory_xact_lock(hashtext('azteque.matchmaking'));

  -- Ménage opportuniste : les lignes sans battement depuis trop longtemps.
  DELETE FROM public.matchmaking_queue
  WHERE public.matchmaking_queue.match_id IS NULL
    AND seen_at < now() - public.mm_peremption();

  -- Le plus ancien qui attend vraiment.
  SELECT q.user_id INTO _autre
  FROM public.matchmaking_queue q
  WHERE q.user_id <> _moi
    AND q.match_id IS NULL
    AND q.seen_at >= now() - public.mm_peremption()
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

/* ------------------------------------------------------------------ */
/* Attendre : battement de cœur et relève de la table trouvée           */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.mm_poll()
RETURNS TABLE(match_id uuid, seat text, devant integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moi uuid := auth.uid();
  _trouvee uuid;
BEGIN
  IF _moi IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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
$$;

REVOKE ALL ON FUNCTION public.mm_poll() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mm_poll() TO authenticated;

/* ------------------------------------------------------------------ */
/* Renoncer                                                            */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.mm_leave()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- On ne retire que ce qui n'a pas encore abouti : une table déjà trouvée
  -- reste annoncée, pour ne pas la perdre sur un clic de dernière seconde.
  DELETE FROM public.matchmaking_queue
  WHERE user_id = auth.uid() AND match_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mm_leave() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mm_leave() TO authenticated;
