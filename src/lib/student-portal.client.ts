import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type PortalAnswer = { questionId: string; answer: string };

function portalError(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function createPortalClient(token?: string) {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("إعدادات الاتصال غير مكتملة على الاستضافة");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { "x-portal-token": token } } : undefined,
  });
}

export async function loginStudentPortal(input: { code: string; password: string }) {
  const client = createPortalClient();
  const { data, error } = await client.rpc("portal_login", {
    _student_code: input.code,
    _password: input.password,
  });
  if (error || !data) portalError(error, "كود الطالب أو كلمة المرور غير صحيحة");
  return data as { token: string; expiresAt: string };
}

export async function getStudentPortal(input: { token: string }) {
  const client = createPortalClient(input.token);
  const { data, error } = await client.rpc("portal_get_dashboard", { _token: input.token });
  if (error || !data) portalError(error, "تعذر تحميل بوابة الطالب");
  return data as Record<string, unknown>;
}

export async function getPortalExam(input: { token: string; examId: string }) {
  const client = createPortalClient(input.token);
  const { data, error } = await client.rpc("portal_open_exam", {
    _token: input.token,
    _exam_id: input.examId,
  });
  if (error || !data) portalError(error, "الاختبار غير متاح");

  const result = data as Record<string, unknown>;
  const imagePath = typeof result.imagePath === "string" ? result.imagePath : null;
  let imageUrl: string | null = null;
  if (imagePath) {
    const { data: signed, error: imageError } = await client.storage
      .from("exam-images")
      .createSignedUrl(imagePath, 60 * 60 * 3);
    if (!imageError) imageUrl = signed?.signedUrl ?? null;
  }
  return { ...result, imageUrl };
}

export async function submitPortalExam(input: {
  token: string;
  examId: string;
  submissionId: string;
  answers: PortalAnswer[];
}) {
  const client = createPortalClient(input.token);
  const { data, error } = await client.rpc("portal_submit_exam", {
    _token: input.token,
    _exam_id: input.examId,
    _submission_id: input.submissionId,
    _answers: input.answers.map((answer) => ({
      question_id: answer.questionId,
      answer: answer.answer,
    })) as Json,
  });
  if (error || !data) portalError(error, "تعذر تسليم الاختبار");
  return data as Record<string, unknown>;
}

export async function changePortalPassword(input: { token: string; password: string }) {
  const client = createPortalClient(input.token);
  const { error } = await client.rpc("portal_change_password", {
    _token: input.token,
    _password: input.password,
  });
  if (error) portalError(error, "تعذر تغيير كلمة المرور");
  return { ok: true };
}