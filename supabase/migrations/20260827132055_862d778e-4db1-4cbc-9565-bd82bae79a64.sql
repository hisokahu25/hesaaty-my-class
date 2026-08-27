CREATE TYPE public.app_role AS ENUM ('admin','teacher','parent','student');
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  days TEXT[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL DEFAULT '16:00',
  location TEXT NOT NULL DEFAULT '',
  fee NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  parent_user_id UUID,
  full_name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  parent_phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.attendance_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount_due NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  paid_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 100,
  exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- roles
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles self insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role <> 'admin');

-- helper: parent link
CREATE OR REPLACE FUNCTION public.is_parent_of_student(_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.parent_user_id = auth.uid())
$$;

CREATE POLICY "groups teacher all" ON public.groups FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "groups parent read" ON public.groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.group_id = groups.id AND s.parent_user_id = auth.uid()));

CREATE POLICY "students teacher all" ON public.students FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "students parent read" ON public.students FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

CREATE POLICY "attendance teacher all" ON public.attendance FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "attendance parent read" ON public.attendance FOR SELECT TO authenticated
  USING (public.is_parent_of_student(student_id));

CREATE POLICY "payments teacher all" ON public.payments FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "payments parent read" ON public.payments FOR SELECT TO authenticated
  USING (public.is_parent_of_student(student_id));

CREATE POLICY "exams teacher all" ON public.exams FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "exams parent read" ON public.exams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.group_id = exams.group_id AND s.parent_user_id = auth.uid()));

CREATE POLICY "grades teacher all" ON public.grades FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "grades parent read" ON public.grades FOR SELECT TO authenticated
  USING (public.is_parent_of_student(student_id));

CREATE POLICY "notifications own" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_students_teacher ON public.students(teacher_id);
CREATE INDEX idx_attendance_teacher_date ON public.attendance(teacher_id, session_date);
CREATE INDEX idx_payments_teacher ON public.payments(teacher_id);