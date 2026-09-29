CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح لك';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'لا يمكنك حذف حسابك';
  END IF;
  DELETE FROM public.exam_answers WHERE teacher_id = _user_id;
  DELETE FROM public.exam_submissions WHERE teacher_id = _user_id;
  DELETE FROM public.exam_answer_keys WHERE teacher_id = _user_id;
  DELETE FROM public.exam_assignments WHERE teacher_id = _user_id;
  DELETE FROM public.exam_questions WHERE teacher_id = _user_id;
  DELETE FROM public.grades WHERE teacher_id = _user_id;
  DELETE FROM public.exams WHERE teacher_id = _user_id;
  DELETE FROM public.attendance WHERE teacher_id = _user_id;
  DELETE FROM public.payments WHERE teacher_id = _user_id;
  DELETE FROM public.expenses WHERE teacher_id = _user_id;
  DELETE FROM public.student_portal_sessions WHERE student_id IN (SELECT id FROM public.students WHERE teacher_id = _user_id);
  DELETE FROM public.student_portal_credentials WHERE student_id IN (SELECT id FROM public.students WHERE teacher_id = _user_id);
  DELETE FROM public.students WHERE teacher_id = _user_id;
  DELETE FROM public.groups WHERE teacher_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.account_approvals WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;