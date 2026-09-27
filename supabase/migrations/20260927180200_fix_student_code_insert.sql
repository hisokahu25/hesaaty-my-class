-- Student codes are assigned by the protected BEFORE INSERT trigger.
-- Keeping a column default calls the revoked helper as the signed-in user
-- before the trigger runs, which blocks otherwise valid student inserts.
ALTER TABLE public.students
  ALTER COLUMN student_code DROP DEFAULT;
