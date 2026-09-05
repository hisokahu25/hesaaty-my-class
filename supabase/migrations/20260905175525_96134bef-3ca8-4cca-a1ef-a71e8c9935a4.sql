CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.has_role(UUID, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_parent_of_student(UUID) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_parent_of_student(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_parent_of_student(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_student_portal_password(_student_id UUID, _password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
BEGIN
  IF length(_password) < 4 OR length(_password) > 72 THEN
    RAISE EXCEPTION 'Password must be between 4 and 72 characters';
  END IF;

  UPDATE public.student_portal_credentials c
  SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf')),
      must_change_password = false,
      updated_at = now()
  FROM public.students s
  WHERE c.student_id = _student_id
    AND s.id = c.student_id
    AND (s.teacher_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_portal_password(UUID, TEXT) TO authenticated, service_role;