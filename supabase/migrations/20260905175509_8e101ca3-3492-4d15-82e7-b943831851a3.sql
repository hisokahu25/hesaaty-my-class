DROP POLICY IF EXISTS "roles first self insert" ON public.user_roles;
REVOKE INSERT ON public.user_roles FROM authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role public.app_role;
BEGIN
  requested_role := CASE
    WHEN COALESCE(NEW.raw_user_meta_data ->> 'role', 'teacher') = 'parent' THEN 'parent'::public.app_role
    ELSE 'teacher'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_role() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

INSERT INTO public.user_roles (user_id, role)
SELECT
  users.id,
  CASE
    WHEN COALESCE(users.raw_user_meta_data ->> 'role', 'teacher') = 'parent' THEN 'parent'::public.app_role
    ELSE 'teacher'::public.app_role
  END
FROM auth.users AS users
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles existing_role WHERE existing_role.user_id = users.id
)
ON CONFLICT (user_id, role) DO NOTHING;