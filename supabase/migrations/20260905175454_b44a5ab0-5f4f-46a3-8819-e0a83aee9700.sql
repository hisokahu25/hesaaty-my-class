DROP POLICY IF EXISTS "roles self insert" ON public.user_roles;

CREATE POLICY "roles first self insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles existing_role
    WHERE existing_role.user_id = auth.uid()
  )
  AND role = CASE
    WHEN COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'teacher') = 'parent' THEN 'parent'::public.app_role
    ELSE 'teacher'::public.app_role
  END
);