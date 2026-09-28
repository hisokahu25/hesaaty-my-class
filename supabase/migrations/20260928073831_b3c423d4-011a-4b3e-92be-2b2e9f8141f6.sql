CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid(),
  category text NOT NULL CHECK (category IN ('rent','secretary','bonus','other')),
  amount numeric NOT NULL CHECK (amount >= 0),
  month text NOT NULL,
  spent_at date NOT NULL DEFAULT current_date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers manage own expenses" ON public.expenses FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.exams ADD COLUMN image_url text;

CREATE POLICY "Teachers upload exam images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exam-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Teachers delete exam images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exam-images' AND (storage.foldername(name))[1] = auth.uid()::text);