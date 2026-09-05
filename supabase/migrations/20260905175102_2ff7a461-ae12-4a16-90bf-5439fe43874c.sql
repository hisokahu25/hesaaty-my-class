CREATE POLICY "portal credentials deny direct access" ON public.student_portal_credentials
FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "portal sessions deny direct access" ON public.student_portal_sessions
FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON FUNCTION public.set_student_portal_password(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_portal_password(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_essay_submission(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_essay_submission(UUID) TO service_role;