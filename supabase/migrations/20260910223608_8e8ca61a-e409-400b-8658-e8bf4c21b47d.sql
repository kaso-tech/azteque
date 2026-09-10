CREATE OR REPLACE FUNCTION public.public_profiles_rows()
RETURNS TABLE(
  id uuid, username text, avatar_kind text, avatar_url text,
  rating integer, peak_rating integer, rated_games integer, rounds_played integer,
  country text, last_seen_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_kind, p.avatar_url,
         p.rating, p.peak_rating, p.rated_games, p.rounds_played,
         p.country, p.last_seen_at, p.created_at, p.updated_at
  FROM public.profiles p;
$$;

REVOKE ALL ON FUNCTION public.public_profiles_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_profiles_rows() TO anon, authenticated, service_role;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles WITH (security_invoker = on) AS
  SELECT * FROM public.public_profiles_rows();

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;