-- N'IMPORTE QUEL joueur connecté pouvait lire la table `profiles` en entier.
--
-- La politique de lecture posée à l'origine du compte était :
--   CREATE POLICY "Profils visibles des joueurs connectés"
--     ON public.profiles FOR SELECT TO authenticated USING (true);
--
-- « USING (true) » veut dire : chaque ligne est visible, sans exception. Ce
-- n'était pas voulu comme une politique publique — l'application n'a jamais
-- cessé d'écrire dans ses propres commentaires que le prénom et le nom ne
-- s'affichent « qu'à vous » — mais c'est bien ce que la base appliquait : un
-- appel direct à `supabase.from('profiles').select('*')` depuis n'importe
-- quel compte renvoyait le prénom, le nom, le solde de jetons, le statut
-- d'administrateur et de suspension de TOUS les joueurs. La vue
-- `public_profiles`, elle correctement limitée aux colonnes publiques, n'était
-- qu'un chemin parmi d'autres : elle ne protégeait rien tant que la table
-- qu'elle interroge restait grande ouverte à côté d'elle.
--
-- La correction restreint la lecture directe de `profiles` à SA PROPRE ligne.
-- Tout le reste passe déjà par un chemin plus étroit :
--   - `public_profiles` (vue SECURITY DEFINER) pour ce qu'un adversaire peut
--     légitimement voir d'un autre joueur ;
--   - les fonctions `admin_*` (SECURITY DEFINER, gardées par `require_admin`)
--     pour la console d'administration ;
--   - `admin-client.server.ts` (clé de service, hors RLS) pour l'arbitrage
--     serveur des parties.
--
-- Un seul usage legitime traversait la table de base pour lire la ligne d'un
-- AUTRE joueur : la vérification de disponibilité d'un pseudo au moment de le
-- choisir ou en changer (`isUsernameFree`), qui n'avait besoin de rien de plus
-- qu'une réponse oui/non. Elle gagne sa propre fonction, qui ne renvoie jamais
-- une ligne — seulement le verdict.

CREATE OR REPLACE FUNCTION public.username_is_free(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Libre s'il n'existe aucun AUTRE compte portant ce pseudo (à la casse
  -- près) : reprendre le sien, ou n'en changer que la casse, reste permis.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username ILIKE _username
      AND id IS DISTINCT FROM auth.uid()
  );
$$;

-- Seul un compte déjà créé renomme (voir `AccountIdentity`) : la création
-- elle-même laisse l'unicité à l'index de la base, sans vérification
-- préalable (voir `createProfile`). Inutile donc d'ouvrir ce chemin à `anon`.
REVOKE ALL ON FUNCTION public.username_is_free(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_is_free(text) TO authenticated;

DROP POLICY IF EXISTS "Profils visibles des joueurs connectés" ON public.profiles;
CREATE POLICY "Chacun ne lit que son propre profil"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);
