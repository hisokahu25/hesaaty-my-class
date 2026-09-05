CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TYPE public.exam_kind AS ENUM ('paper', 'online', 'essay');
CREATE TYPE public.exam_publish_status AS ENUM ('draft', 'published');
CREATE TYPE public.exam_question_type AS ENUM ('mcq', 'true_false', 'essay');
CREATE TYPE public.exam_submission_status AS ENUM ('in_progress', 'submitted', 'graded');

CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE student_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE public.students
  ADD COLUMN student_code TEXT;

UPDATE public.students
SET student_code = public.generate_student_code()
WHERE student_code IS NULL;

ALTER TABLE public.students
  ALTER COLUMN student_code SET NOT NULL,
  ADD CONSTRAINT students_student_code_key UNIQUE (student_code),
  ADD CONSTRAINT students_student_code_format CHECK (student_code ~ '^[A-Z2-9]{6}$');

CREATE TABLE public.student_portal_credentials (
  student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.student_portal_credentials TO service_role;
ALTER TABLE public.student_portal_credentials ENABLE ROW LEVEL SECURITY;

INSERT INTO public.student_portal_credentials (student_id, password_hash)
SELECT id, extensions.crypt(
  CASE
    WHEN length(regexp_replace(parent_phone, '[^0-9]', '', 'g')) >= 4
      THEN right(regexp_replace(parent_phone, '[^0-9]', '', 'g'), 4)
    ELSE right(student_code, 4)
  END,
  extensions.gen_salt('bf')
)
FROM public.students;

CREATE OR REPLACE FUNCTION public.prepare_student_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.student_code IS NULL OR NEW.student_code = '' THEN
    NEW.student_code := public.generate_student_code();
  ELSE
    NEW.student_code := upper(trim(NEW.student_code));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_student_code_before_insert
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.prepare_student_code();

CREATE OR REPLACE FUNCTION public.create_student_portal_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(NEW.parent_phone, ''), '[^0-9]', '', 'g');
  IF length(digits) < 4 THEN
    RAISE EXCEPTION 'Parent phone must contain at least 4 digits';
  END IF;
  INSERT INTO public.student_portal_credentials (student_id, password_hash)
  VALUES (NEW.id, extensions.crypt(right(digits, 4), extensions.gen_salt('bf')));
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_student_portal_credentials_after_insert
AFTER INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.create_student_portal_credentials();

CREATE OR REPLACE FUNCTION public.set_student_portal_password(_student_id UUID, _password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF length(_password) < 4 OR length(_password) > 72 THEN
    RAISE EXCEPTION 'Password must be between 4 and 72 characters';
  END IF;

  UPDATE public.student_portal_credentials c
  SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf')),
      password_changed_at = now(),
      updated_at = now()
  FROM public.students s
  WHERE c.student_id = _student_id
    AND s.id = c.student_id
    AND (s.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_student_portal_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_portal_password(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.authenticate_student_portal(_student_code TEXT, _password TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.student_portal_credentials c ON c.student_id = s.id
  WHERE s.student_code = upper(trim(_student_code))
    AND c.password_hash = extensions.crypt(_password, c.password_hash)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.authenticate_student_portal(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_student_portal(TEXT, TEXT) TO service_role;

ALTER TABLE public.exams
  ADD COLUMN kind public.exam_kind NOT NULL DEFAULT 'paper',
  ADD COLUMN publish_status public.exam_publish_status NOT NULL DEFAULT 'draft',
  ADD COLUMN instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN starts_at TIMESTAMPTZ,
  ADD COLUMN ends_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.validate_exam_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'paper' AND (NEW.starts_at IS NULL OR NEW.ends_at IS NULL) THEN
    RAISE EXCEPTION 'Online exams require start and end times';
  END IF;
  IF NEW.starts_at IS NOT NULL AND NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Exam end time must be after start time';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_exam_window_before_write
BEFORE INSERT OR UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.validate_exam_window();

CREATE TABLE public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  question_type public.exam_question_type NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  points NUMERIC NOT NULL DEFAULT 1 CHECK (points > 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT ALL ON public.exam_questions TO service_role;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam questions teacher manage" ON public.exam_questions FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.exam_answer_keys (
  question_id UUID PRIMARY KEY REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  correct_answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answer_keys TO authenticated;
GRANT ALL ON public.exam_answer_keys TO service_role;
ALTER TABLE public.exam_answer_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam answer keys teacher manage" ON public.exam_answer_keys FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exam_assignment_target CHECK ((group_id IS NOT NULL) <> (student_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_assignments TO authenticated;
GRANT ALL ON public.exam_assignments TO service_role;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX exam_assignments_exam_group_unique ON public.exam_assignments(exam_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX exam_assignments_exam_student_unique ON public.exam_assignments(exam_id, student_id) WHERE student_id IS NOT NULL;
CREATE POLICY "exam assignments teacher manage" ON public.exam_assignments FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "exam assignments linked parent read" ON public.exam_assignments FOR SELECT TO authenticated
  USING (
    (student_id IS NOT NULL AND public.is_parent_of_student(student_id))
    OR (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.group_id = exam_assignments.group_id AND s.parent_user_id = auth.uid()
    ))
  );

CREATE POLICY "exam questions linked parent read" ON public.exam_questions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.exam_assignments a ON a.exam_id = e.id
    JOIN public.students s ON (a.student_id = s.id OR (a.group_id IS NOT NULL AND a.group_id = s.group_id))
    WHERE e.id = exam_questions.exam_id
      AND e.publish_status = 'published'
      AND s.parent_user_id = auth.uid()
  ));

CREATE TABLE public.exam_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.exam_submission_status NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  auto_score NUMERIC NOT NULL DEFAULT 0,
  manual_score NUMERIC,
  final_score NUMERIC,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_submissions TO authenticated;
GRANT ALL ON public.exam_submissions TO service_role;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam submissions teacher manage" ON public.exam_submissions FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "exam submissions parent read" ON public.exam_submissions FOR SELECT TO authenticated
  USING (public.is_parent_of_student(student_id));

CREATE TABLE public.exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.exam_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  is_correct BOOLEAN,
  points_awarded NUMERIC,
  grader_comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_answers TO service_role;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam answers teacher manage" ON public.exam_answers FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "exam answers parent read" ON public.exam_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_submissions sub
    WHERE sub.id = exam_answers.submission_id
      AND public.is_parent_of_student(sub.student_id)
  ));

CREATE TABLE public.student_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.student_portal_sessions TO service_role;
ALTER TABLE public.student_portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_exam_questions_updated_at BEFORE UPDATE ON public.exam_questions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_student_portal_credentials_updated_at BEFORE UPDATE ON public.student_portal_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_exam_answer_keys_updated_at BEFORE UPDATE ON public.exam_answer_keys
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_exam_assignments_updated_at BEFORE UPDATE ON public.exam_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_exam_submissions_updated_at BEFORE UPDATE ON public.exam_submissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_exam_answers_updated_at BEFORE UPDATE ON public.exam_answers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_student_portal_sessions_updated_at BEFORE UPDATE ON public.student_portal_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.grade_objective_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exam_kind_value public.exam_kind;
  calculated_auto_score NUMERIC;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'in_progress' THEN
    UPDATE public.exam_answers a
    SET is_correct = (a.answer_text = k.correct_answer),
        points_awarded = CASE WHEN a.answer_text = k.correct_answer THEN q.points ELSE 0 END,
        updated_at = now()
    FROM public.exam_questions q
    JOIN public.exam_answer_keys k ON k.question_id = q.id
    WHERE a.submission_id = NEW.id
      AND a.question_id = q.id
      AND q.question_type IN ('mcq', 'true_false');

    SELECT COALESCE(sum(points_awarded), 0)
    INTO calculated_auto_score
    FROM public.exam_answers
    WHERE submission_id = NEW.id
      AND is_correct IS NOT NULL;

    SELECT kind INTO exam_kind_value FROM public.exams WHERE id = NEW.exam_id;

    IF exam_kind_value = 'online' THEN
      UPDATE public.exam_submissions
      SET auto_score = calculated_auto_score,
          manual_score = 0,
          final_score = calculated_auto_score,
          status = 'graded',
          graded_at = now()
      WHERE id = NEW.id;

      INSERT INTO public.grades (teacher_id, exam_id, student_id, score)
      VALUES (NEW.teacher_id, NEW.exam_id, NEW.student_id, calculated_auto_score)
      ON CONFLICT (exam_id, student_id) DO UPDATE SET score = EXCLUDED.score;
    ELSE
      UPDATE public.exam_submissions
      SET auto_score = calculated_auto_score
      WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER grade_objective_submission_after_submit
AFTER UPDATE OF status ON public.exam_submissions
FOR EACH ROW EXECUTE FUNCTION public.grade_objective_submission();

CREATE OR REPLACE FUNCTION public.finalize_essay_submission(_submission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submission_row public.exam_submissions%ROWTYPE;
  calculated_manual_score NUMERIC;
BEGIN
  SELECT * INTO submission_row FROM public.exam_submissions WHERE id = _submission_id;
  IF submission_row.id IS NULL OR NOT (submission_row.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_answers a
    JOIN public.exam_questions q ON q.id = a.question_id
    WHERE a.submission_id = _submission_id
      AND q.question_type = 'essay'
      AND a.points_awarded IS NULL
  ) THEN
    RAISE EXCEPTION 'All essay answers must be graded first';
  END IF;

  SELECT COALESCE(sum(a.points_awarded), 0)
  INTO calculated_manual_score
  FROM public.exam_answers a
  JOIN public.exam_questions q ON q.id = a.question_id
  WHERE a.submission_id = _submission_id AND q.question_type = 'essay';

  UPDATE public.exam_submissions
  SET manual_score = calculated_manual_score,
      final_score = auto_score + calculated_manual_score,
      status = 'graded',
      graded_at = now()
  WHERE id = _submission_id;

  INSERT INTO public.grades (teacher_id, exam_id, student_id, score)
  VALUES (submission_row.teacher_id, submission_row.exam_id, submission_row.student_id, submission_row.auto_score + calculated_manual_score)
  ON CONFLICT (exam_id, student_id) DO UPDATE SET score = EXCLUDED.score;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_essay_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_essay_submission(UUID) TO authenticated, service_role;

DROP POLICY "exams parent read" ON public.exams;
CREATE POLICY "exams linked parent read" ON public.exams FOR SELECT TO authenticated
  USING (
    publish_status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.exam_assignments a
      JOIN public.students s ON (a.student_id = s.id OR (a.group_id IS NOT NULL AND a.group_id = s.group_id))
      WHERE a.exam_id = exams.id AND s.parent_user_id = auth.uid()
    )
  );

CREATE INDEX idx_students_student_code ON public.students(student_code);
CREATE INDEX idx_exam_questions_exam ON public.exam_questions(exam_id, position);
CREATE INDEX idx_exam_assignments_exam ON public.exam_assignments(exam_id);
CREATE INDEX idx_exam_assignments_student ON public.exam_assignments(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX idx_exam_submissions_student ON public.exam_submissions(student_id, created_at DESC);
CREATE INDEX idx_exam_answers_submission ON public.exam_answers(submission_id);