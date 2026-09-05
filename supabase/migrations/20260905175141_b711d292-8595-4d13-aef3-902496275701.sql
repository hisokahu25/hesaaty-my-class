CREATE OR REPLACE FUNCTION public.service_set_student_portal_password(_student_id UUID, _password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF length(_password) < 4 OR length(_password) > 72 THEN
    RAISE EXCEPTION 'Password must be between 4 and 72 characters';
  END IF;
  UPDATE public.student_portal_credentials
  SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf')),
      password_changed_at = now(),
      updated_at = now()
  WHERE student_id = _student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student credentials not found';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.service_set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_set_student_portal_password(UUID, TEXT) TO service_role;