CREATE OR REPLACE FUNCTION public.teacher_set_student_portal_password(_student_id uuid, _password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = _student_id
      AND (s.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'الطالب غير موجود أو غير مصرح لك';
  END IF;
  IF length(_password) < 4 OR length(_password) > 72 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون بين 4 و72 حرفًا';
  END IF;
  INSERT INTO public.student_portal_credentials (student_id, password_hash, password_changed_at, updated_at)
  VALUES (_student_id, extensions.crypt(_password, extensions.gen_salt('bf')), now(), now())
  ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
    password_changed_at = now(), updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.teacher_set_student_portal_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_set_student_portal_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_essay_submission(uuid) TO authenticated;