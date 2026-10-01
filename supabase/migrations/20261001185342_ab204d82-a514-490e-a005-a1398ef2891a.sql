CREATE OR REPLACE FUNCTION private.with_owner(_arr jsonb, _uid uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $$ SELECT coalesce(jsonb_agg(e || jsonb_build_object('teacher_id', _uid)), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(_arr, '[]'::jsonb)) e $$;

CREATE OR REPLACE FUNCTION public.admin_export_user_data(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t text; arr jsonb; result jsonb := jsonb_build_object('version', 1, 'exported_at', now());
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح لك';
  END IF;
  FOREACH t IN ARRAY ARRAY['groups','students','exams','exam_questions','exam_answer_keys','exam_assignments','exam_submissions','exam_answers','grades','attendance','payments','expenses'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x WHERE teacher_id = $1', t) INTO arr USING _user_id;
    result := result || jsonb_build_object(t, arr);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO arr FROM public.student_portal_credentials c
    WHERE c.student_id IN (SELECT id FROM public.students WHERE teacher_id = _user_id);
  RETURN result || jsonb_build_object('student_portal_credentials', arr);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_wipe_user_data(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح لك';
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
END; $$;

CREATE OR REPLACE FUNCTION public.admin_import_user_data(_user_id uuid, _data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح لك';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN RAISE EXCEPTION 'الحساب غير موجود'; END IF;
  FOREACH t IN ARRAY ARRAY['groups','students','exams','exam_questions','exam_answer_keys','exam_assignments','exam_submissions','exam_answers','grades','attendance','payments','expenses'] LOOP
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(null::public.%I, $1) ON CONFLICT DO NOTHING', t, t)
      USING private.with_owner(_data->t, _user_id);
  END LOOP;
  INSERT INTO public.student_portal_credentials
  SELECT * FROM jsonb_populate_recordset(null::public.student_portal_credentials, coalesce(_data->'student_portal_credentials','[]'::jsonb)) c
  WHERE c.student_id IN (SELECT id FROM public.students WHERE teacher_id = _user_id)
  ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at;
END; $$;

REVOKE ALL ON FUNCTION public.admin_export_user_data(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wipe_user_data(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_import_user_data(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_user_data(uuid, jsonb) TO authenticated;