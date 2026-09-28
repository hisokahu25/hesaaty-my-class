CREATE OR REPLACE FUNCTION public.teacher_set_student_portal_password(_student_id uuid, _password text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = _student_id
      AND (s.teacher_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role))
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
END; $function$;

CREATE OR REPLACE FUNCTION public.finalize_essay_submission(_submission_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  submission_row public.exam_submissions%ROWTYPE;
  calculated_manual_score NUMERIC;
BEGIN
  SELECT * INTO submission_row FROM public.exam_submissions WHERE id = _submission_id;
  IF submission_row.id IS NULL OR NOT (submission_row.teacher_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_answers a JOIN public.exam_questions q ON q.id = a.question_id
    WHERE a.submission_id = _submission_id AND q.question_type = 'essay' AND a.points_awarded IS NULL
  ) THEN
    RAISE EXCEPTION 'All essay answers must be graded first';
  END IF;
  SELECT COALESCE(sum(a.points_awarded), 0) INTO calculated_manual_score
  FROM public.exam_answers a JOIN public.exam_questions q ON q.id = a.question_id
  WHERE a.submission_id = _submission_id AND q.question_type = 'essay';
  UPDATE public.exam_submissions
  SET manual_score = calculated_manual_score, final_score = auto_score + calculated_manual_score,
      status = 'graded', graded_at = now()
  WHERE id = _submission_id;
  INSERT INTO public.grades (teacher_id, exam_id, student_id, score)
  VALUES (submission_row.teacher_id, submission_row.exam_id, submission_row.student_id, submission_row.auto_score + calculated_manual_score)
  ON CONFLICT (exam_id, student_id) DO UPDATE SET score = EXCLUDED.score;
END;
$function$;