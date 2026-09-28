CREATE POLICY "Teachers read own exam images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exam-images' AND (storage.foldername(name))[1] = auth.uid()::text);