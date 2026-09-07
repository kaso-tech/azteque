UPDATE public.profiles
SET is_admin = true
WHERE username = 'Wallace';

SELECT id, username, is_admin
FROM public.profiles
WHERE username = 'Wallace';