-- Une table sans adversaire ne survit pas à deux minutes.
--
-- (Migration à appliquer sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- Chaque invitation, chaque partie par code crée une ligne `waiting`. Quand
-- personne ne vient — l'invité refuse sans répondre, le code n'est jamais
-- partagé, l'hôte ferme son onglet — cette ligne restait pour toujours. Elles
-- s'accumulaient, encombraient la console d'administration, et surtout
-- faisaient croire à une partie en cours là où il n'y avait qu'une porte
-- ouverte sur une pièce vide.
--
-- Deux minutes suffisent très largement : une invitation qu'on accepte, on
-- l'accepte dans la minute, et le code se donne de vive voix. Au-delà, la
-- ligne est SUPPRIMÉE, pas close — il n'y a rien à archiver d'une partie qui
-- n'a jamais eu lieu, ni score, ni mise, ni adversaire. Les invitations qui la
-- désignent partent avec elle (game_invites.match_id est ON DELETE CASCADE),
-- et la file d'attente se contente d'oublier la référence (ON DELETE SET
-- NULL) : rien d'autre ne pointe vers `matches`.
--
-- Le ménage est opportuniste, comme celui des parties abandonnées : il se
-- greffe sur `terminer_parties_abandonnees()`, que les battements de présence
-- (`touch_last_seen`) et la file d'attente (`mm_poll`) appellent déjà à
-- chaque passage. Aucune tâche planifiée à maintenir.

/* ------------------------------------------------------------------ */
/* Le délai                                                            */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.attente_delai()
RETURNS interval
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT interval '2 minutes';
$$;

-- L'index sert le filtre ET l'ordre : la purge ne lit que les lignes mûres.
CREATE INDEX IF NOT EXISTS matches_attente_a_purger
  ON public.matches (created_at)
  WHERE status = 'waiting';

/* ------------------------------------------------------------------ */
/* La purge                                                            */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.supprimer_parties_en_attente()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _supprimees int;
BEGIN
  -- `created_at` et non `updated_at` : c'est bien l'âge de la DEMANDE qui
  -- expire. Une ligne retouchée entre-temps (négociation de mise entamée
  -- seul, par exemple) n'a pas pour autant trouvé d'adversaire.
  WITH mortes AS (
    DELETE FROM public.matches
    WHERE status = 'waiting'
      AND guest_id IS NULL
      AND created_at < now() - public.attente_delai()
    RETURNING id
  )
  SELECT count(*) INTO _supprimees FROM mortes;

  -- Les invitations partent en cascade avec la table. Restent celles qui
  -- pointent vers une table déjà disparue autrement, ou qu'on a laissées
  -- « pending » sans jamais y répondre : même délai, même sort.
  UPDATE public.game_invites
  SET status = 'cancelled'
  WHERE status = 'pending'
    AND created_at < now() - public.attente_delai();

  RETURN _supprimees;
END;
$function$;

REVOKE ALL ON FUNCTION public.supprimer_parties_en_attente() FROM PUBLIC;

/* ------------------------------------------------------------------ */
/* Greffe sur le balayage existant                                     */
/* ------------------------------------------------------------------ */

-- Corps repris À L'IDENTIQUE de 20260919170000_balayage_abandons_debloque.sql,
-- à la seule ligne `PERFORM public.supprimer_parties_en_attente()` près : on
-- ne touche ni à `touch_last_seen` ni à `mm_poll`, qui appellent déjà celle-ci
-- et ont reçu depuis des corrections qu'il ne faut pas écraser.
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
  PERFORM set_config('azteque.balayage', 'on', true);

  -- Les tables jamais rejointes s'en vont d'abord : inutile de les examiner
  -- une par une plus bas, elles n'ont ni état ni mise à trancher.
  PERFORM public.supprimer_parties_en_attente();

  FOR _m IN
    SELECT * FROM public.matches
    WHERE status = 'playing'
      AND settled_at IS NULL
      AND updated_at < now() - public.abandon_delai()
    ORDER BY updated_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF _m.state IS NULL OR _m.host_id IS NULL OR _m.guest_id IS NULL THEN
      -- Table jamais distribuée, ou siège vide : rien à trancher, rien à payer.
      UPDATE public.matches
        SET status = 'finished', finished_at = now(), settled_at = now()
        WHERE id = _m.id;
    ELSIF _m.state ->> 'phase' = 'gameEnd' THEN
      PERFORM public._settle_match_impl(_m.id);
    ELSE
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

  PERFORM set_config('azteque.balayage', 'off', true);
  RETURN _finies;
END;
$function$;

REVOKE ALL ON FUNCTION public.terminer_parties_abandonnees() FROM PUBLIC;

/* ------------------------------------------------------------------ */
/* Le grand ménage, une fois                                           */
/* ------------------------------------------------------------------ */

-- Tout ce qui traîne aujourd'hui part, sans condition d'âge : ces lignes sont
-- là depuis des jours, aucune n'attend plus personne. À partir de maintenant,
-- la règle des deux minutes suffit à ce que cela ne revienne pas.
DELETE FROM public.matches WHERE status = 'waiting';

-- Et les invitations restées en suspens, qui ne mènent plus nulle part.
UPDATE public.game_invites SET status = 'cancelled' WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
