ALTER TABLE public.students ALTER COLUMN student_code SET DEFAULT public.generate_student_code();

REVOKE ALL ON FUNCTION public.generate_student_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_student_code() TO service_role;
REVOKE ALL ON FUNCTION public.prepare_student_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_student_portal_credentials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_exam_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grade_objective_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authenticate_student_portal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_student_portal(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_portal_password(UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_essay_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_essay_submission(UUID) TO authenticated, service_role;

REVOKE ALL ON public.student_portal_credentials FROM anon, authenticated;
GRANT ALL ON public.student_portal_credentials TO service_role;
REVOKE ALL ON public.student_portal_sessions FROM anon, authenticated;
GRANT ALL ON public.student_portal_sessions TO service_role;