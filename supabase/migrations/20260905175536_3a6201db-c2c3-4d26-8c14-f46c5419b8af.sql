REVOKE ALL ON FUNCTION public.set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.set_student_portal_password(UUID, TEXT) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_student_portal_password(UUID, TEXT) TO service_role;