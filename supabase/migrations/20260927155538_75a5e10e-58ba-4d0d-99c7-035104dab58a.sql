DROP POLICY IF EXISTS "Sons lisibles de tous" ON storage.objects;
DROP POLICY IF EXISTS "Sons listés par les administrateurs" ON storage.objects;
CREATE POLICY "Sons listés par les administrateurs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'sounds' AND public.is_admin());