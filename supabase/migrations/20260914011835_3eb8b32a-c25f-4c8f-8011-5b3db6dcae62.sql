-- Profils : autorisation d'écriture limitée aux colonnes non sensibles
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_kind, avatar_url, background_kind, country, last_seen_at, updated_at)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Mise à jour restreinte du profil" ON public.profiles;
CREATE POLICY "Mise à jour restreinte du profil"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Parties : aucune écriture directe depuis le navigateur
REVOKE UPDATE ON public.matches FROM authenticated;
DROP POLICY IF EXISTS "Participants can update their match" ON public.matches;
GRANT ALL ON public.matches TO service_role;