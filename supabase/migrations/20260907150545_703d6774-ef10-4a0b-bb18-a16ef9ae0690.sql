-- Vue des profils publics : seuls les champs affichables aux autres joueurs
CREATE OR REPLACE VIEW public.public_profiles AS
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

-- Remplacer la policy SELECT trop large
DROP POLICY IF EXISTS "Profils visibles des joueurs connectés" ON public.profiles;

CREATE POLICY "Lecture restreinte du profil" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin());

-- Remplacer la policy UPDATE trop permissive
DROP POLICY IF EXISTS "Chacun modifie son profil" ON public.profiles;

CREATE POLICY "Mise à jour restreinte du profil" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Trigger qui protège les colonnes sensibles contre les modifications par les joueurs
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.tokens IS DISTINCT FROM OLD.tokens
     OR NEW.claimed_local_tokens IS DISTINCT FROM OLD.claimed_local_tokens
     OR NEW.daily_bonus_at IS DISTINCT FROM OLD.daily_bonus_at
     OR NEW.local_tokens_total IS DISTINCT FROM OLD.local_tokens_total
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.banned IS DISTINCT FROM OLD.banned
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.peak_rating IS DISTINCT FROM OLD.peak_rating
     OR NEW.rated_games IS DISTINCT FROM OLD.rated_games
     OR NEW.rounds_played IS DISTINCT FROM OLD.rounds_played
  THEN
    RAISE EXCEPTION 'Colonnes protégées : tokens, statut admin, suspension, cote, parties classées, etc.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_currency ON public.profiles;
CREATE TRIGGER profiles_protect_sensitive_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_sensitive_columns();