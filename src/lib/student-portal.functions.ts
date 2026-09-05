import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function getPortalStudent(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: session } = await supabaseAdmin
    .from("student_portal_sessions")
    .select("student_id, expires_at")
    .eq("token_hash", tokenHash(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session) throw new Error("انتهت الجلسة، سجّل الدخول مرة أخرى");
  return { supabaseAdmin, studentId: session.student_id };
}

export const loginStudentPortal = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: z.string().trim().min(6).max(6), password: z.string().min(4).max(72) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: studentId, error } = await supabaseAdmin.rpc("authenticate_student_portal", {
      _student_code: data.code,
      _password: data.password,
    });
    if (error || !studentId) throw new Error("كود الطالب أو كلمة المرور غير صحيحة");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await supabaseAdmin.from("student_portal_sessions").insert({
      student_id: studentId,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
    });
    if (sessionError) throw sessionError;
    return { token, expiresAt };
  });

export const getStudentPortal = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().length(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin, studentId } = await getPortalStudent(data.token);
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id, full_name, student_code, grade, group_id, teacher_id")
      .eq("id", studentId)
      .single();
    if (studentError) throw studentError;
    const { data: assignments } = await supabaseAdmin
      .from("exam_assignments")
      .select("exam_id")
      .or(`student_id.eq.${student.id},group_id.eq.${student.group_id ?? "00000000-0000-0000-0000-000000000000"}`);
    const examIds = [...new Set((assignments ?? []).map((row) => row.exam_id))];
    if (examIds.length === 0) return { student, exams: [] };
    const { data: exams, error: examsError } = await supabaseAdmin
      .from("exams")
      .select("id, title, kind, max_score, instructions, starts_at, ends_at, publish_status")
      .in("id", examIds)
      .eq("publish_status", "published")
      .neq("kind", "paper")
      .order("starts_at");
    if (examsError) throw examsError;
    const { data: submissions } = await supabaseAdmin
      .from("exam_submissions")
      .select("id, exam_id, status, submitted_at, final_score")
      .eq("student_id", student.id);
    return {
      student,
      exams: (exams ?? []).map((exam) => ({
        ...exam,
        submission: (submissions ?? []).find((item) => item.exam_id === exam.id) ?? null,
      })),
    };
  });

export const getPortalExam = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().length(64), examId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin, studentId } = await getPortalStudent(data.token);
    const { data: student } = await supabaseAdmin.from("students").select("group_id").eq("id", studentId).single();
    const { data: assignment } = await supabaseAdmin
      .from("exam_assignments")
      .select("id")
      .eq("exam_id", data.examId)
      .or(`student_id.eq.${studentId},group_id.eq.${student?.group_id ?? "00000000-0000-0000-0000-000000000000"}`)
      .limit(1)
      .maybeSingle();
    if (!assignment) throw new Error("هذا الاختبار غير مخصص للطالب");
    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("id, title, kind, max_score, instructions, starts_at, ends_at, publish_status, teacher_id")
      .eq("id", data.examId)
      .single();
    const now = Date.now();
    if (!exam || exam.publish_status !== "published") throw new Error("الاختبار غير منشور");
    if (!exam.starts_at || !exam.ends_at || now < new Date(exam.starts_at).getTime() || now > new Date(exam.ends_at).getTime()) {
      throw new Error("الاختبار غير متاح في الوقت الحالي");
    }
    const { data: existing } = await supabaseAdmin
      .from("exam_submissions")
      .select("id, status")
      .eq("exam_id", exam.id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing && existing.status !== "in_progress") throw new Error("تم تسليم هذا الاختبار بالفعل");
    let submissionId = existing?.id;
    if (!submissionId) {
      const { data: created, error } = await supabaseAdmin.from("exam_submissions").insert({
        exam_id: exam.id, student_id: studentId, teacher_id: exam.teacher_id,
      }).select("id").single();
      if (error) throw error;
      submissionId = created.id;
    }
    const { data: questions, error } = await supabaseAdmin
      .from("exam_questions")
      .select("id, question_type, prompt, options, points, position")
      .eq("exam_id", exam.id)
      .order("position");
    if (error) throw error;
    return { exam, submissionId, questions: questions ?? [] };
  });

export const submitPortalExam = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    token: z.string().length(64),
    examId: z.string().uuid(),
    submissionId: z.string().uuid(),
    answers: z.array(z.object({ questionId: z.string().uuid(), answer: z.string().max(5000) })),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin, studentId } = await getPortalStudent(data.token);
    const { data: submission } = await supabaseAdmin.from("exam_submissions")
      .select("id, teacher_id, status, exam_id")
      .eq("id", data.submissionId).eq("student_id", studentId).eq("exam_id", data.examId).single();
    if (!submission || submission.status !== "in_progress") throw new Error("لا يمكن تسليم هذا الاختبار");
    const { data: exam } = await supabaseAdmin.from("exams").select("ends_at").eq("id", data.examId).single();
    if (!exam?.ends_at || Date.now() > new Date(exam.ends_at).getTime()) throw new Error("انتهى وقت الاختبار");
    const rows = data.answers.map((answer) => ({
      submission_id: submission.id,
      question_id: answer.questionId,
      teacher_id: submission.teacher_id,
      answer_text: answer.answer,
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("exam_answers").upsert(rows, { onConflict: "submission_id,question_id" });
      if (error) throw error;
    }
    const { error } = await supabaseAdmin.from("exam_submissions").update({
      status: "submitted", submitted_at: new Date().toISOString(),
    }).eq("id", submission.id);
    if (error) throw error;
    const { data: result } = await supabaseAdmin.from("exam_submissions").select("status, final_score").eq("id", submission.id).single();
    return result;
  });

export const changePortalPassword = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().length(64), password: z.string().min(4).max(72) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin, studentId } = await getPortalStudent(data.token);
    const { error } = await supabaseAdmin.rpc("service_set_student_portal_password", { _student_id: studentId, _password: data.password });
    if (error) throw error;
    return { ok: true };
  });

export const setStudentPortalPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ studentId: z.string().uuid(), password: z.string().min(4).max(72) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: student } = await context.supabase.from("students").select("id").eq("id", data.studentId).maybeSingle();
    if (!student) throw new Error("الطالب غير موجود أو غير مصرح لك");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("service_set_student_portal_password", { _student_id: data.studentId, _password: data.password });
    if (error) throw error;
    return { ok: true };
  });

export const finalizeEssaySubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ submissionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: submission } = await context.supabase.from("exam_submissions").select("id").eq("id", data.submissionId).maybeSingle();
    if (!submission) throw new Error("المحاولة غير موجودة أو غير مصرح لك");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("finalize_essay_submission", { _submission_id: data.submissionId });
    if (error) throw error;
    return { ok: true };
  });
