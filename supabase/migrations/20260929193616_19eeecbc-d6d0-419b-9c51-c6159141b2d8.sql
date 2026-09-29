CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(_user_id uuid, _email text DEFAULT NULL, _password text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions'
AS $$
DECLARE new_email text := lower(trim(coalesce(_email,'')));
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح لك';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'الحساب غير موجود';
  END IF;
  IF new_email <> '' THEN
    IF new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'البريد غير صالح'; END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = new_email AND id <> _user_id) THEN
      RAISE EXCEPTION 'البريد مستخدم لحساب آخر';
    END IF;
    UPDATE auth.users SET email = new_email, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() WHERE id = _user_id;
    UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', new_email), updated_at = now()
      WHERE user_id = _user_id AND provider = 'email';
    UPDATE public.account_approvals SET email = new_email WHERE user_id = _user_id;
  END IF;
  IF coalesce(_password,'') <> '' THEN
    IF length(_password) < 6 OR length(_password) > 72 THEN RAISE EXCEPTION 'كلمة المرور يجب أن تكون بين 6 و72 حرفًا'; END IF;
    UPDATE auth.users SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')), updated_at = now() WHERE id = _user_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_user_credentials(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid,text,text) TO authenticated;