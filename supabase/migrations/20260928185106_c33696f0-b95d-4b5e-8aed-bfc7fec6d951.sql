ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.validate_exam_window()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.starts_at IS NOT NULL AND NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Exam end time must be after start time';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;