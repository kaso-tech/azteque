-- La recherche de joueurs (et tout ce qui affiche le profil d'un AUTRE
-- joueur : liste d'amis, adversaire en ligne, classement) est cassée depuis
-- que `public_profiles` est passée en `security_invoker = true`.
--
-- Cette vue existe justement pour exposer une projection sûre — pseudo,
-- avatar, cote, pays — à tous les joueurs, indépendamment de la ligne à
-- laquelle ils appartiennent. En `security_invoker`, une requête à travers la
-- vue est soumise aux MÊMES policies RLS que `public.profiles` : hors "id =
-- auth.uid() OR is_admin()", plus aucune ligne d'un autre joueur n'est
-- visible. Chacun ne se voit plus que lui-même, donc `searchPlayers` ne
-- renvoie jamais rien (le résultat exclut de toute façon sa propre ligne).
--
-- Les joueurs de longue date ont des amis déjà ajoutés avant cette
-- régression et ne remarquent rien ; ce sont les nouveaux inscrits, sans
-- aucun ami, qui tombent dessus en cherchant quelqu'un pour la première fois.
--
-- Le correctif rétablit le comportement d'origine de la vue (celui
-- immédiatement après sa création) : sans `security_invoker`, elle s'exécute
-- avec les droits de son propriétaire — le rôle des migrations, propriétaire
-- de `profiles`, qui n'est jamais soumis à ses propres policies RLS. La vue
-- reste sûre malgré tout : elle ne peut renvoyer QUE les colonnes énumérées
-- ci-dessous, jamais les jetons, le statut admin, la suspension ou les
-- détails de parrainage — ceux-là restent uniquement lisibles par
-- `public.profiles` elle-même, toujours restreinte à sa propre ligne.
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT
  id,
  username,
  avatar_kind,
  avatar_url,
  rating,
  peak_rating,
  rated_games,
  rounds_played,
  country,
  last_seen_at,
  created_at,
  updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
GRANT ALL ON public.public_profiles TO service_role;
