CREATE OR REPLACE FUNCTION public.prepare_student_code()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
BEGIN
  IF NEW.student_code IS NULL OR NEW.student_code = '' THEN
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE student_code = candidate);
    END LOOP;
    NEW.student_code := candidate;
  ELSE
    NEW.student_code := upper(trim(NEW.student_code));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_student_portal_credentials()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  digits TEXT;
  initial_pw TEXT;
BEGIN
  digits := regexp_replace(COALESCE(NEW.parent_phone, ''), '[^0-9]', '', 'g');
  IF length(digits) >= 4 THEN
    initial_pw := right(digits, 4);
  ELSE
    initial_pw := encode(extensions.gen_random_bytes(24), 'hex');
  END IF;
  INSERT INTO public.student_portal_credentials (student_id, password_hash)
  VALUES (NEW.id, extensions.crypt(initial_pw, extensions.gen_salt('bf')));
  RETURN NEW;
END;
$$;