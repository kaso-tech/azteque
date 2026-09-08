REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_kind, avatar_url, country, last_seen_at) ON public.profiles TO authenticated;