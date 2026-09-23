-- Monter d'un grade demandait une douzaine de victoires nettes.
--
-- (Migration à appliquer sur le projet Supabase externe jwhrkxqwhvfpdxuufbwz.
-- Le dossier supabase/migrations/ du dépôt est réservé au backend interne de
-- la plateforme ; ce fichier fait foi pour rejouer le schéma ailleurs.)
--
-- Le barème d'origine promettait « environ cinq victoires » par palier. Le
-- compte réel, lui, était tout autre : contre un adversaire de sa cote, une
-- victoire rapportait K/2 = 12 points, et un palier en valait 150. Il fallait
-- donc TREIZE victoires nettes — treize de plus que de défaites — pour chaque
-- grade au-delà du premier, et cent quatorze pour atteindre le sommet. Aucun
-- joueur ne voit le bout d'un tel chemin : il monte une fois, pendant le
-- rodage où les gains sont doublés, puis a le sentiment que le classement
-- s'est arrêté.
--
-- Deux corrections, qui se lisent ensemble :
--
--   1. Les paliers s'élargissent au lieu d'être tous identiques (côté client,
--      src/lib/azteque/rank.ts) : les premiers se franchissent en trois ou
--      quatre victoires, les derniers en une quinzaine.
--   2. K passe de 24 à 32 en régime ordinaire, ci-dessous. Chaque partie pèse
--      donc plus lourd — dans les deux sens, l'Elo restant symétrique : ce
--      n'est pas un cadeau, c'est un classement qui réagit.
--
-- Résultat : 3, 4, 6, 7, 9, 10, 11, 17, 18 victoires nettes de grade en
-- grade, au lieu de 5, 10, 12, 13, 12, 13, 12, 19, 18. Le sommet reste long à
-- atteindre — 85 victoires nettes — mais cesse d'être théorique.
--
-- Aucun joueur n'est rétrogradé : tous les nouveaux seuils sont PLUS BAS que
-- ceux qu'ils remplacent. Les cotes en base ne sont pas touchées ; seule la
-- lecture qu'on en fait change, et elle ne peut que promouvoir.

-- Coefficient K : l'amplitude maximale d'un résultat.
--
-- Élevé au début, le temps que la cote rejoigne le niveau réel du joueur ;
-- resserré au sommet, où une cote doit se mériter sur la durée et non sur un
-- coup de chance. Le seuil de ce resserrement suit le palier Grand Maître,
-- qui descend de 2000 à 1840 : sans ce déplacement, les deux derniers grades
-- se seraient retrouvés à cheval sur deux régimes de gain.
CREATE OR REPLACE FUNCTION public.elo_k(_rated_games integer, _rating integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(_rated_games, 0) < 10 THEN 40  -- rodage
    WHEN COALESCE(_rating, 1000) >= 1840 THEN 24 -- Grand Maître et au-delà
    ELSE 32
  END;
$$;

NOTIFY pgrst, 'reload schema';
