CREATE TABLE public.account_approvals (
  user_id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.account_approvals TO authenticated;
GRANT ALL ON public.account_approvals TO service_role;
ALTER TABLE public.account_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own approval read" ON public.account_approvals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admin approval update" ON public.account_approvals FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER touch_account_approvals BEFORE UPDATE ON public.account_approvals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- existing accounts stay approved
INSERT INTO public.account_approvals (user_id, email, full_name, status, reviewed_at)
SELECT u.id, COALESCE(u.email,''), COALESCE(u.raw_user_meta_data->>'full_name',''), 'approved', now()
FROM auth.users u ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.account_approvals (user_id, email, full_name, status)
  VALUES (NEW.id, COALESCE(NEW.email,''), COALESCE(NEW.raw_user_meta_data->>'full_name',''), 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Owner account: becomes admin + approved only with a verified email
CREATE OR REPLACE FUNCTION public.claim_owner_admin()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE ok boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()
    AND lower(email) = 'hisoka.hunter25@gmail.com' AND email_confirmed_at IS NOT NULL) INTO ok;
  IF ok THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.account_approvals (user_id, email, status, reviewed_at)
    VALUES (auth.uid(), 'hisoka.hunter25@gmail.com', 'approved', now())
    ON CONFLICT (user_id) DO UPDATE SET status = 'approved', reviewed_at = now();
  END IF;
  RETURN ok;
END; $$;
REVOKE ALL ON FUNCTION public.claim_owner_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_owner_admin() TO authenticated;