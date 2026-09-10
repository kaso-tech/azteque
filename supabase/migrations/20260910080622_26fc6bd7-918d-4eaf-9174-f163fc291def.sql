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