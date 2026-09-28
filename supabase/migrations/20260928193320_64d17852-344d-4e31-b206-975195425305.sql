ALTER FUNCTION public.portal_login(text, text) SET SCHEMA private;
ALTER FUNCTION public.portal_student_id(text) SET SCHEMA private;
ALTER FUNCTION public.portal_get_dashboard(text) SET SCHEMA private;
ALTER FUNCTION public.portal_open_exam(text, uuid) SET SCHEMA private;
ALTER FUNCTION public.portal_submit_exam(text, uuid, uuid, jsonb) SET SCHEMA private;
ALTER FUNCTION public.portal_change_password(text, text) SET SCHEMA private;
ALTER FUNCTION public.portal_can_read_exam_image(text, text) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.portal_get_dashboard(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
  portal_student_id uuid := private.portal_student_id(_token);
  result jsonb;
BEGIN
  IF portal_student_id IS NULL THEN
    RAISE EXCEPTION 'انتهت الجلسة، سجّل الدخول مرة أخرى';
  END IF;
  SELECT jsonb_build_object(
    'student', jsonb_build_object('id', s.id, 'full_name', s.full_name, 'student_code', s.student_code, 'grade', s.grade, 'group_id', s.group_id, 'teacher_id', s.teacher_id),
    'exams', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'kind', e.kind, 'max_score', e.max_score,
      'instructions', e.instructions, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'publish_status', e.publish_status, 'is_closed', e.is_closed,
      'submission', CASE WHEN sub.id IS NULL THEN NULL ELSE jsonb_build_object('id', sub.id, 'status', sub.status, 'submitted_at', sub.submitted_at, 'final_score', sub.final_score) END
    ) ORDER BY e.starts_at NULLS FIRST, e.created_at DESC)
    FROM public.exams e
    LEFT JOIN public.exam_submissions sub ON sub.exam_id = e.id AND sub.student_id = s.id
    WHERE e.publish_status = 'published' AND e.kind <> 'paper'
      AND EXISTS (SELECT 1 FROM public.exam_assignments a WHERE a.exam_id = e.id AND (a.student_id = s.id OR (a.group_id IS NOT NULL AND a.group_id = s.group_id)))), '[]'::jsonb)
  ) INTO result FROM public.students s WHERE s.id = portal_student_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.portal_open_exam(_token text, _exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
  portal_student_id uuid := private.portal_student_id(_token);
  student_group_id uuid;
  exam_row public.exams%ROWTYPE;
  submission_row public.exam_submissions%ROWTYPE;
  questions_json jsonb;
BEGIN
  IF portal_student_id IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجّل الدخول مرة أخرى'; END IF;
  SELECT group_id INTO student_group_id FROM public.students WHERE id = portal_student_id;
  SELECT * INTO exam_row FROM public.exams WHERE id = _exam_id;
  IF exam_row.id IS NULL OR exam_row.publish_status <> 'published' OR exam_row.kind = 'paper' THEN RAISE EXCEPTION 'الاختبار غير منشور'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exam_assignments a WHERE a.exam_id = _exam_id AND (a.student_id = portal_student_id OR (a.group_id IS NOT NULL AND a.group_id = student_group_id))) THEN RAISE EXCEPTION 'هذا الاختبار غير مخصص للطالب'; END IF;
  IF exam_row.is_closed OR (exam_row.starts_at IS NOT NULL AND now() < exam_row.starts_at) OR (exam_row.ends_at IS NOT NULL AND now() > exam_row.ends_at) THEN RAISE EXCEPTION 'الاختبار غير متاح في الوقت الحالي'; END IF;
  SELECT * INTO submission_row FROM public.exam_submissions WHERE exam_id = _exam_id AND student_id = portal_student_id;
  IF submission_row.id IS NOT NULL AND submission_row.status <> 'in_progress' THEN RAISE EXCEPTION 'تم تسليم هذا الاختبار بالفعل'; END IF;
  IF submission_row.id IS NULL THEN
    INSERT INTO public.exam_submissions (exam_id, student_id, teacher_id) VALUES (exam_row.id, portal_student_id, exam_row.teacher_id) RETURNING * INTO submission_row;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', q.id, 'question_type', q.question_type, 'prompt', q.prompt, 'options', q.options, 'points', q.points, 'position', q.position) ORDER BY q.position), '[]'::jsonb)
  INTO questions_json FROM public.exam_questions q WHERE q.exam_id = exam_row.id;
  RETURN jsonb_build_object('exam', jsonb_build_object('id', exam_row.id, 'title', exam_row.title, 'kind', exam_row.kind, 'max_score', exam_row.max_score, 'instructions', exam_row.instructions, 'starts_at', exam_row.starts_at, 'ends_at', exam_row.ends_at, 'publish_status', exam_row.publish_status, 'is_closed', exam_row.is_closed, 'teacher_id', exam_row.teacher_id, 'image_url', exam_row.image_url), 'submissionId', submission_row.id, 'imagePath', exam_row.image_url, 'questions', questions_json);
END;
$$;

CREATE OR REPLACE FUNCTION private.portal_submit_exam(_token text, _exam_id uuid, _submission_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
  portal_student_id uuid := private.portal_student_id(_token);
  submission_row public.exam_submissions%ROWTYPE;
  exam_row public.exams%ROWTYPE;
  result jsonb;
BEGIN
  IF portal_student_id IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجّل الدخول مرة أخرى'; END IF;
  IF jsonb_typeof(_answers) <> 'array' OR jsonb_array_length(_answers) > 500 THEN RAISE EXCEPTION 'صيغة الإجابات غير صحيحة'; END IF;
  SELECT * INTO submission_row FROM public.exam_submissions WHERE id = _submission_id AND student_id = portal_student_id AND exam_id = _exam_id;
  IF submission_row.id IS NULL OR submission_row.status <> 'in_progress' THEN RAISE EXCEPTION 'لا يمكن تسليم هذا الاختبار'; END IF;
  SELECT * INTO exam_row FROM public.exams WHERE id = _exam_id;
  IF exam_row.id IS NULL OR exam_row.is_closed OR (exam_row.ends_at IS NOT NULL AND now() > exam_row.ends_at) THEN RAISE EXCEPTION 'انتهى وقت الاختبار'; END IF;
  INSERT INTO public.exam_answers (submission_id, question_id, teacher_id, answer_text)
  SELECT submission_row.id, q.id, submission_row.teacher_id, left(COALESCE(a.answer, ''), 5000)
  FROM jsonb_to_recordset(_answers) AS a(question_id uuid, answer text)
  JOIN public.exam_questions q ON q.id = a.question_id AND q.exam_id = _exam_id
  ON CONFLICT (submission_id, question_id) DO UPDATE SET answer_text = EXCLUDED.answer_text, updated_at = now();
  UPDATE public.exam_submissions SET status = 'submitted', submitted_at = now() WHERE id = submission_row.id;
  SELECT jsonb_build_object('status', status, 'final_score', final_score) INTO result FROM public.exam_submissions WHERE id = submission_row.id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.portal_change_password(_token text, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE portal_student_id uuid := private.portal_student_id(_token);
BEGIN
  IF portal_student_id IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجّل الدخول مرة أخرى'; END IF;
  IF length(_password) < 4 OR length(_password) > 72 THEN RAISE EXCEPTION 'كلمة المرور يجب أن تكون بين 4 و72 حرفًا'; END IF;
  UPDATE public.student_portal_credentials SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf')), password_changed_at = now(), updated_at = now() WHERE student_id = portal_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.portal_can_read_exam_image(_object_name text, _token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s JOIN public.exams e ON e.image_url = _object_name
    WHERE s.id = private.portal_student_id(_token) AND e.publish_status = 'published'
      AND EXISTS (SELECT 1 FROM public.exam_assignments a WHERE a.exam_id = e.id AND (a.student_id = s.id OR (a.group_id IS NOT NULL AND a.group_id = s.group_id)))
  )
$$;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_student_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_get_dashboard(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_open_exam(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_submit_exam(text, uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_change_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.portal_can_read_exam_image(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_login(_student_code text, _password text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_login(_student_code, _password) $$;
CREATE OR REPLACE FUNCTION public.portal_get_dashboard(_token text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_get_dashboard(_token) $$;
CREATE OR REPLACE FUNCTION public.portal_open_exam(_token text, _exam_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_open_exam(_token, _exam_id) $$;
CREATE OR REPLACE FUNCTION public.portal_submit_exam(_token text, _exam_id uuid, _submission_id uuid, _answers jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_submit_exam(_token, _exam_id, _submission_id, _answers) $$;
CREATE OR REPLACE FUNCTION public.portal_change_password(_token text, _password text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_change_password(_token, _password) $$;
CREATE OR REPLACE FUNCTION public.portal_can_read_exam_image(_object_name text, _token text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'private', 'pg_temp' AS $$ SELECT private.portal_can_read_exam_image(_object_name, _token) $$;
REVOKE ALL ON FUNCTION public.portal_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_get_dashboard(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_open_exam(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_submit_exam(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_change_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_can_read_exam_image(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_dashboard(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_open_exam(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_submit_exam(text, uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_change_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_read_exam_image(text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "portal students read assigned exam images" ON storage.objects;
CREATE POLICY "portal students read assigned exam images" ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'exam-images' AND public.portal_can_read_exam_image(name, COALESCE((current_setting('request.headers', true)::jsonb ->> 'x-portal-token'), '')));