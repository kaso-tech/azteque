ALTER TABLE public.matches
  ADD COLUMN host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN guest_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Anyone can create matches" ON public.matches;
DROP POLICY IF EXISTS "Anyone can read matches" ON public.matches;
DROP POLICY IF EXISTS "Anyone can update matches" ON public.matches;

REVOKE ALL ON public.matches FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

CREATE POLICY "Participants can read their match"
ON public.matches
FOR SELECT
TO authenticated
USING (auth.uid() = host_id OR auth.uid() = guest_id);

CREATE POLICY "Players can create their own match"
ON public.matches
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = host_id
  AND guest_id IS NULL
  AND guest_name IS NULL
  AND status = 'waiting'
);

CREATE POLICY "Participants can update their match"
ON public.matches
FOR UPDATE
TO authenticated
USING (auth.uid() = host_id OR auth.uid() = guest_id)
WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);

CREATE OR REPLACE FUNCTION public.join_match_by_code(_code text, _guest_name text)
RETURNS SETOF public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  UPDATE public.matches
  SET guest_id = auth.uid(),
      guest_name = COALESCE(NULLIF(btrim(_guest_name), ''), 'Invité'),
      status = 'playing'
  WHERE code = upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'))
    AND status = 'waiting'
    AND guest_id IS NULL
    AND host_id IS DISTINCT FROM auth.uid()
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.join_match_by_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_match_by_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_match_by_code(text, text) TO service_role;