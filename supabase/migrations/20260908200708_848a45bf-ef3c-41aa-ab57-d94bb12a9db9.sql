-- Console d'administration v2 : agrégats pour le tableau de bord.
--
-- La console ne demande pas des lignes — elle demande des nombres. Quatre
-- fonctions stables, indexées par période, lisent ce que la base a déjà :
-- un compteur pour les chiffres de tête, une série quotidienne pour la
-- courbe d'activité, un top pour la géographie et un top pour les joueurs.
-- Toutes sont SECURITY DEFINER et appellent require_admin() : la page
-- /admin/dashboard ne peut rien voir de plus que ce qu'elle voyait déjà.

/* ------------------------------------------------------------------ */
/* Compteurs de tête                                                   */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT jsonb_build_object(
    -- Joueurs actifs sur 24 h : on s'appuie sur last_seen_at, comme partout
    -- ailleurs dans la console. C'est plus juste que created_at, qui ne dit
    -- rien de l'usage réel.
    'active_24h', (
      SELECT count(*) FROM public.profiles
      WHERE last_seen_at > now() - interval '24 hours'
    ),
    -- Parties terminées sur 24 h, donc settled_at renseigné.
    'matches_24h', (
      SELECT count(*) FROM public.matches
      WHERE settled_at > now() - interval '24 hours'
    ),
    -- Jetons en circulation : somme des soldes. Négligeable en volume, on
    -- la garde précise.
    'tokens_circulation', (
      SELECT COALESCE(sum(tokens), 0)::bigint FROM public.profiles
    ),
    -- Revenu boutique 7 j : somme des prix d'achat sur la fenêtre. On ne
    -- stocke pas le prix dans purchases, on le joint à shop_items.
    'revenue_7d', (
      SELECT COALESCE(sum(si.price), 0)::bigint
      FROM public.purchases pu
      JOIN public.shop_items si ON si.id = pu.item_id
      WHERE pu.bought_at > now() - interval '7 days'
    ),
    -- Tendances sur 24 h vs les 24 h précédentes. Calculées ici pour que
    -- le client n'ait qu'à afficher.
    'active_24h_delta', (
      WITH s AS (
        SELECT
          count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours') AS a,
          count(*) FILTER (
            WHERE last_seen_at > now() - interval '48 hours'
              AND last_seen_at <= now() - interval '24 hours'
          ) AS b
        FROM public.profiles
      )
      SELECT CASE WHEN b = 0 THEN NULL
        ELSE round(((a - b)::numeric / b) * 100)
      END FROM s
    ),
    'matches_24h_delta', (
      WITH s AS (
        SELECT
          count(*) FILTER (WHERE settled_at > now() - interval '24 hours') AS a,
          count(*) FILTER (
            WHERE settled_at > now() - interval '48 hours'
              AND settled_at <= now() - interval '24 hours'
          ) AS b
        FROM public.matches
      )
      SELECT CASE WHEN b = 0 THEN NULL
        ELSE round(((a - b)::numeric / b) * 100)
      END FROM s
    ),
    -- Santé du service, exposée à la console pour qu'elle n'aille pas
    -- interroger postgREST en ping. Nombre de parties non terminées depuis
    -- plus d'une heure : un signal de panne plus fiable qu'un taux d'erreur
    -- agrégé.
    'stuck_matches', (
      SELECT count(*) FROM public.matches m
      WHERE m.settled_at IS NULL
        AND m.finished_at IS NULL
        AND m.created_at < now() - interval '1 hour'
    )
  ) INTO _r;
  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

/* ------------------------------------------------------------------ */
/* Série quotidienne de parties jouées                                 */
/* ------------------------------------------------------------------ */

-- Une ligne par jour sur les N derniers jours (inclus aujourd'hui). On
-- borne N à 90 jours : au-delà, la console n'en fait rien d'utile et la
-- fonction devient inutilement large.
DROP FUNCTION IF EXISTS public.admin_dashboard_series(int);

CREATE OR REPLACE FUNCTION public.admin_dashboard_series(_days int DEFAULT 14)
RETURNS TABLE (
  jour date,
  parties bigint,
  nouveaux_joueurs bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _days := least(greatest(COALESCE(_days, 14), 1), 90);
  RETURN QUERY
  WITH jours AS (
    SELECT generate_series(
      current_date - (_days - 1),
      current_date,
      interval '1 day'
    )::date AS d
  )
  SELECT
    j.d AS jour,
    COALESCE((
      SELECT count(*) FROM public.matches m
      WHERE m.settled_at::date = j.d
    ), 0)::bigint AS parties,
    COALESCE((
      SELECT count(*) FROM public.profiles p
      WHERE p.created_at::date = j.d
    ), 0)::bigint AS nouveaux_joueurs
  FROM jours j
  ORDER BY j.d ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_series(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_series(int) TO authenticated;

/* ------------------------------------------------------------------ */
/* Top pays                                                            */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.admin_dashboard_top_countries(int);

CREATE OR REPLACE FUNCTION public.admin_dashboard_top_countries(_limit int DEFAULT 5)
RETURNS TABLE (
  country text,
  joueurs bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _limit := least(greatest(COALESCE(_limit, 5), 1), 50);
  RETURN QUERY
  SELECT p.country, count(*)::bigint AS joueurs
  FROM public.profiles p
  WHERE p.country IS NOT NULL
  GROUP BY p.country
  ORDER BY joueurs DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_top_countries(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_top_countries(int) TO authenticated;

/* ------------------------------------------------------------------ */
/* Top joueurs sur 7 jours (gain de cote)                              */
/* ------------------------------------------------------------------ */

-- La cote évolue à chaque partie terminée. On calcule le delta sur la
-- fenêtre 7 j en sommant rating_delta_host + rating_delta_guest du
-- gagnant — un joueur qui gagne 18 et perd 12 sur 7 j a un delta net
-- de +6. On ne garde que les gagnants nets, triés par gain décroissant.
DROP FUNCTION IF EXISTS public.admin_dashboard_top_players(int);

CREATE OR REPLACE FUNCTION public.admin_dashboard_top_players(_limit int DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  country text,
  rating int,
  delta int,
  parties int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _limit := least(greatest(COALESCE(_limit, 5), 1), 50);
  RETURN QUERY
  WITH delta AS (
    SELECT
      p.id,
      p.username,
      p.country,
      p.rating,
      COALESCE(sum(
        CASE
          WHEN m.host_id = p.id THEN m.rating_delta_host
          WHEN m.guest_id = p.id THEN m.rating_delta_guest
          ELSE 0
        END
      ), 0)::int AS net,
      count(*)::int AS parties
    FROM public.profiles p
    LEFT JOIN public.matches m
      ON m.settled_at > now() - interval '7 days'
     AND (m.host_id = p.id OR m.guest_id = p.id)
    GROUP BY p.id, p.username, p.country, p.rating
  )
  SELECT
    d.id, d.username, d.country, d.rating, d.net AS delta, d.parties
  FROM delta d
  WHERE d.parties > 0
  ORDER BY d.net DESC, d.rating DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_top_players(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_top_players(int) TO authenticated;

/* ------------------------------------------------------------------ */
/* Fiche joueur détaillée                                               */
/* ------------------------------------------------------------------ */

-- Les N dernières parties d'un joueur, avec le delta de cote appliqué et
-- l'adversaire nommé. On calcule le résultat à partir de winner_id : si
-- le joueur courant est l'hôte, il a gagné quand champWinner = 0, etc.
DROP FUNCTION IF EXISTS public.admin_player_recent_matches(uuid, int);

CREATE OR REPLACE FUNCTION public.admin_player_recent_matches(
  _user_id uuid,
  _limit int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  finished_at timestamptz,
  opponent text,
  result text,
  score text,
  rating_delta int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _limit := least(greatest(COALESCE(_limit, 8), 1), 50);
  RETURN QUERY
  WITH last_matches AS (
    SELECT
      m.id,
      m.finished_at,
      m.host_id,
      m.guest_id,
      m.winner_id,
      m.rating_delta_host,
      m.rating_delta_guest,
      m.state,
      CASE WHEN m.host_id = _user_id THEN m.guest_id ELSE m.host_id END AS opponent_id,
      CASE
        WHEN m.host_id = _user_id THEN m.rating_delta_host
        WHEN m.guest_id = _user_id THEN m.rating_delta_guest
        ELSE 0
      END AS delta
    FROM public.matches m
    WHERE (m.host_id = _user_id OR m.guest_id = _user_id)
      AND m.finished_at IS NOT NULL
    ORDER BY m.finished_at DESC
    LIMIT _limit
  )
  SELECT
    lm.id,
    lm.finished_at,
    COALESCE(p.username, '—') AS opponent,
    CASE
      WHEN lm.winner_id = _user_id THEN 'gagne'::text
      WHEN lm.winner_id IS NULL THEN 'nul'::text
      ELSE 'perdu'::text
    END AS result,
    -- Score lisible : tours gagnés par (soi, adversaire). L'état du jeu
    -- porte roundsWon[0] (host) et roundsWon[1] (guest).
    (COALESCE((lm.state -> 'roundsWon' ->> 0)::int, 0)
      || '-'
      || COALESCE((lm.state -> 'roundsWon' ->> 1)::int, 0)) AS score,
    lm.delta::int AS rating_delta
  FROM last_matches lm
  LEFT JOIN public.profiles p ON p.id = lm.opponent_id
  ORDER BY lm.finished_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_player_recent_matches(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_player_recent_matches(uuid, int) TO authenticated;

-- Série quotidienne de cote pour un joueur. On part de la cote actuelle
-- et on remonte le temps en annulant les deltas de chaque partie
-- terminée, dans l'ordre chronologique. C'est suffisant pour un graphe :
-- la forme est correcte, même si la valeur absolue peut différer de la
-- cote "vécue" le jour J si la fonction de cote a changé entre-temps.
DROP FUNCTION IF EXISTS public.admin_player_rating_series(uuid, int);

CREATE OR REPLACE FUNCTION public.admin_player_rating_series(
  _user_id uuid,
  _days int DEFAULT 60
)
RETURNS TABLE (
  jour date,
  rating int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  _days := least(greatest(COALESCE(_days, 60), 1), 365);
  RETURN QUERY
  WITH jours AS (
    SELECT generate_series(
      current_date - (_days - 1),
      current_date,
      interval '1 day'
    )::date AS d
  ),
  parties_ordered AS (
    SELECT
      m.finished_at,
      CASE
        WHEN m.host_id = _user_id THEN m.rating_delta_host
        WHEN m.guest_id = _user_id THEN m.rating_delta_guest
        ELSE 0
      END AS delta
    FROM public.matches m
    WHERE (m.host_id = _user_id OR m.guest_id = _user_id)
      AND m.finished_at IS NOT NULL
    ORDER BY m.finished_at DESC
  ),
  -- Cote au début de la fenêtre = cote actuelle - somme des deltas des
  -- parties dont finished_at > début de la fenêtre. On annule ces deltas
  -- en marchant jour par jour.
  courant AS (
    SELECT rating FROM public.profiles WHERE id = _user_id
  ),
  -- Cote théorique au début de la fenêtre (cote à j-(days-1)).
  cote_debut AS (
    SELECT (
      (SELECT rating FROM courant)
      - COALESCE((
        SELECT sum(delta) FROM parties_ordered
        WHERE finished_at >= current_date - (_days - 1)
      ), 0)
    )::int AS r
  ),
  -- Pour chaque jour de la fenêtre, cote = cote_debut + somme des deltas
  -- des parties terminées entre début de la fenêtre et la fin du jour.
  journaliere AS (
    SELECT
      j.d AS jour,
      (
        (SELECT r FROM cote_debut)
        + COALESCE((
          SELECT sum(po.delta) FROM parties_ordered po
          WHERE po.finished_at::date <= j.d
            AND po.finished_at >= current_date - (_days - 1)
        ), 0)
      )::int AS rating
    FROM jours j
  )
  SELECT jour, rating FROM journaliere ORDER BY jour ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_player_rating_series(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_player_rating_series(uuid, int) TO authenticated;

-- Nombre d'achats d'un joueur. Petit, ponctuel : un count direct suffit,
-- pas besoin de surdimensionner.
DROP FUNCTION IF EXISTS public.admin_player_purchase_count(uuid);

CREATE OR REPLACE FUNCTION public.admin_player_purchase_count(_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n int;
BEGIN
  PERFORM public.require_admin();
  SELECT count(*)::int INTO _n
  FROM public.purchases
  WHERE user_id = _user_id;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_player_purchase_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_player_purchase_count(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';