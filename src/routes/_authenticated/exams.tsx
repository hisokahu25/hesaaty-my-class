import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, Lock, LockOpen, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchGroups, fetchStudents } from "@/lib/db";
import { finalizeEssaySubmission } from "@/lib/student-portal.functions";

type ExamKind = "online" | "essay";
type Question = { type: "mcq" | "true_false" | "essay"; prompt: string; points: string; options: string[]; correct: string };
const blankQuestion = (kind: ExamKind): Question => ({
  type: kind === "essay" ? "essay" : "mcq",
  prompt: "",
  points: "1",
  options: kind === "essay" ? [] : ["", "", "", ""],
  correct: kind === "essay" ? "" : "0",
});

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({ meta: [
    { title: "الامتحانات الإلكترونية | حصتي" },
    { name: "description", content: "إنشاء ونشر وتصحيح الامتحانات الإلكترونية والمقالية في حصتي." },
    { property: "og:title", content: "الامتحانات الإلكترونية | حصتي" },
    { property: "og:description", content: "إدارة الامتحانات الإلكترونية والمقالية للطلاب." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ExamsPage,
});

function ExamsPage() {
  const qc = useQueryClient();
  const finishEssay = useServerFn(finalizeEssaySubmission);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExamKind>("online");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([blankQuestion("online")]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [editExamId, setEditExamId] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });
  const exams = useQuery({
    queryKey: ["digital-exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams")
        .select("id,title,kind,max_score,publish_status,is_closed,starts_at,ends_at,created_at")
        .in("kind", ["online", "essay"]).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const submissions = useQuery({
    queryKey: ["exam-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_submissions")
        .select("id,exam_id,student_id,status,final_score,submitted_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const review = useQuery({
    queryKey: ["submission-review", reviewId], enabled: Boolean(reviewId),
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_answers")
        .select("id,answer_text,points_awarded,grader_comment,exam_questions(prompt,points,question_type)")
        .eq("submission_id", reviewId ?? "");
      if (error) throw error;
      return data ?? [];
    },
  });
  const editing = useQuery({
    queryKey: ["exam-edit", editExamId],
    enabled: Boolean(editExamId),
    queryFn: async () => {
      const id = editExamId!;
      const { data: exam, error } = await supabase.from("exams")
        .select("id,title,kind,instructions,starts_at,ends_at,image_url")
        .eq("id", id).single();
      if (error) throw error;
      const [{ data: rows }, { data: assigns }, { data: subs }] = await Promise.all([
        supabase.from("exam_questions")
          .select("id,question_type,prompt,options,points,position,exam_answer_keys(correct_answer)")
          .eq("exam_id", id).order("position"),
        supabase.from("exam_assignments").select("group_id,student_id").eq("exam_id", id),
        supabase.from("exam_submissions").select("id").eq("exam_id", id).limit(1),
      ]);
      let imageUrlPreview: string | null = null;
      if (exam.image_url) {
        const { data: signed } = await supabase.storage.from("exam-images").createSignedUrl(exam.image_url, 3600);
        imageUrlPreview = signed?.signedUrl ?? null;
      }
      return { exam, questions: rows ?? [], assignments: assigns ?? [], hasSubmissions: (subs?.length ?? 0) > 0, imageUrlPreview };
    },
  });

  useEffect(() => {
    const data = editing.data;
    if (!editExamId || !data?.exam) return;
    const examKind: ExamKind = data.exam.kind === "essay" ? "essay" : "online";
    setKind(examKind);
    setTitle(data.exam.title);
    setInstructions(data.exam.instructions ?? "");
    setStartsAt(toLocalInput(data.exam.starts_at));
    setEndsAt(toLocalInput(data.exam.ends_at));
    setExistingImageUrl(data.exam.image_url ?? null);
    setImageFile(null);
    setGroupIds(data.assignments.filter((a) => a.group_id).map((a) => a.group_id!));
    setStudentIds(data.assignments.filter((a) => a.student_id).map((a) => a.student_id!));
    const loaded = (data.questions ?? []).map((q) => {
      const opts = (q.options as string[] | null) ?? [];
      return {
        type: q.question_type as Question["type"],
        prompt: q.prompt,
        points: String(q.points),
        options: q.question_type === "true_false"
          ? ["صح", "خطأ"]
          : q.question_type === "essay"
            ? []
            : [...opts, ...Array(Math.max(4 - opts.length, 0)).fill("")].slice(0, 4),
        correct: (Array.isArray(q.exam_answer_keys) ? q.exam_answer_keys[0]?.correct_answer : (q.exam_answer_keys as { correct_answer: string } | null)?.correct_answer) ?? "0",
      };
    });
    setQuestions(loaded.length ? loaded : [blankQuestion(examKind)]);
  }, [editExamId, editing.data]);

  const saveExam = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!title.trim()) throw new Error("أكمل اسم الاختبار");
      if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("النهاية يجب أن تكون بعد البداية");
      if (!questions.length || questions.some((q) => !q.prompt.trim())) throw new Error("أكمل نصوص الأسئلة");
      if (!groupIds.length && !studentIds.length) throw new Error("اختر مجموعة أو طالبًا واحدًا على الأقل");
      let imagePath: string | null = existingImageUrl;
      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) throw new Error("الملف يجب أن يكون صورة");
        imagePath = `${auth.user.id}/${crypto.randomUUID()}.${imageFile.name.split(".").pop() || "jpg"}`;
        const { error: upErr } = await supabase.storage.from("exam-images").upload(imagePath, imageFile, { contentType: imageFile.type });
        if (upErr) throw upErr;
      }
      const total = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
      const examPayload = {
        title: title.trim(), instructions: instructions.trim(),
        max_score: total, exam_date: (startsAt || new Date().toISOString()).slice(0, 10), starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null, image_url: imagePath,
      };
      const writeQuestions = async (examId: string) => {
        const { data: insertedQuestions, error: questionError } = await supabase.from("exam_questions").insert(
          questions.map((q, index) => ({ exam_id: examId, teacher_id: auth.user!.id, question_type: q.type,
            prompt: q.prompt.trim(), points: Number(q.points) || 1, position: index,
            options: q.type === "true_false" ? ["صح", "خطأ"] : q.options.filter(Boolean) })),
        ).select("id,position");
        if (questionError) throw questionError;
        const keys = (insertedQuestions ?? []).flatMap((row) => {
          const q = questions[row.position];
          return q && q.type !== "essay" ? [{ question_id: row.id, teacher_id: auth.user!.id, correct_answer: q.correct }] : [];
        });
        if (keys.length) {
          const { error: keyError } = await supabase.from("exam_answer_keys").insert(keys);
          if (keyError) throw keyError;
        }
        const assignments = [
          ...groupIds.map((group_id) => ({ exam_id: examId, teacher_id: auth.user!.id, group_id })),
          ...studentIds.map((student_id) => ({ exam_id: examId, teacher_id: auth.user!.id, student_id })),
        ];
        const { error: assignmentError } = await supabase.from("exam_assignments").insert(assignments);
        if (assignmentError) throw assignmentError;
      };
      if (editExamId) {
        const { data: subs } = await supabase.from("exam_submissions").select("id").eq("exam_id", editExamId).limit(1);
        if (subs?.length) throw new Error("يتعذر التعديل: يوجد حلول مسجلة لهذا الاختبار");
        const { error: updErr } = await supabase.from("exams").update(examPayload).eq("id", editExamId);
        if (updErr) throw updErr;
        const { data: oldQs } = await supabase.from("exam_questions").select("id").eq("exam_id", editExamId);
        const oldIds = (oldQs ?? []).map((q) => q.id);
        if (oldIds.length) {
          const { error: keyDelErr } = await supabase.from("exam_answer_keys").delete().in("question_id", oldIds);
          if (keyDelErr) throw keyDelErr;
        }
        const { error: qDelErr } = await supabase.from("exam_questions").delete().eq("exam_id", editExamId);
        if (qDelErr) throw qDelErr;
        const { error: aDelErr } = await supabase.from("exam_assignments").delete().eq("exam_id", editExamId);
        if (aDelErr) throw aDelErr;
        await writeQuestions(editExamId);
        return;
      }
      const { data: exam, error } = await supabase.from("exams").insert({
        teacher_id: auth.user.id, kind, publish_status: "draft", ...examPayload,
      }).select("id").single();
      if (error) throw error;
      await writeQuestions(exam.id);
    },
    onSuccess: () => {
      toast.success(editExamId ? "تم حفظ التعديلات" : "تم حفظ الاختبار كمسودة");
      closeDialog();
      qc.invalidateQueries({ queryKey: ["digital-exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exams").update({ publish_status: "published" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم نشر الاختبار"); qc.invalidateQueries({ queryKey: ["digital-exams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClosed = useMutation({
    mutationFn: async ({ id, closed }: { id: string; closed: boolean }) => {
      const { error } = await supabase.from("exams").update({ is_closed: closed }).eq("id", id);
      if (error) throw error;
      return closed;
    },
    onSuccess: (closed) => { toast.success(closed ? "تم قفل الاختبار" : "تم فتح الاختبار"); qc.invalidateQueries({ queryKey: ["digital-exams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExam = useMutation({
    mutationFn: async (id: string) => {
      const { data: subs } = await supabase.from("exam_submissions").select("id").eq("exam_id", id);
      const subIds = (subs ?? []).map((s) => s.id);
      if (subIds.length) {
        const r1 = await supabase.from("exam_answers").delete().in("submission_id", subIds); if (r1.error) throw r1.error;
        const r2 = await supabase.from("exam_submissions").delete().eq("exam_id", id); if (r2.error) throw r2.error;
      }
      const { data: qs } = await supabase.from("exam_questions").select("id").eq("exam_id", id);
      const qIds = (qs ?? []).map((q) => q.id);
      if (qIds.length) { const r = await supabase.from("exam_answer_keys").delete().in("question_id", qIds); if (r.error) throw r.error; }
      for (const t of ["grades", "exam_assignments", "exam_questions"] as const) {
        const r = await supabase.from(t).delete().eq("exam_id", id); if (r.error) throw r.error;
      }
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حذف الاختبار"); qc.invalidateQueries({ queryKey: ["digital-exams"] }); qc.invalidateQueries({ queryKey: ["exam-submissions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function saveAnswerGrade(answerId: string, points: number, max: number) {
    const { error } = await supabase.from("exam_answers").update({ points_awarded: Math.min(Math.max(points, 0), max) }).eq("id", answerId);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["submission-review", reviewId] });
  }

  function closeDialog() {
    setOpen(false);
    setEditExamId(null);
    setExistingImageUrl(null);
    setImageFile(null);
    setTitle(""); setInstructions(""); setStartsAt(""); setEndsAt("");
    setGroupIds([]); setStudentIds([]); setQuestions([blankQuestion(kind)]);
  }
  function openCreate() { closeDialog(); setOpen(true); }
  function openEdit(id: string) {
    setEditExamId(id); setExistingImageUrl(null); setImageFile(null);
    setTitle(""); setInstructions(""); setStartsAt(""); setEndsAt("");
    setGroupIds([]); setStudentIds([]); setQuestions([blankQuestion("online")]);
    setOpen(true);
  }
  function changeKind(next: ExamKind) { setKind(next); setQuestions([blankQuestion(next)]); }
  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((q, i) => i === index ? { ...q, ...patch } : q));
  }
  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }
  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }

  return (
    <AppShell title="الامتحانات" subtitle="إنشاء ونشر ومراجعة الاختبارات">
      <SectionTitle title={`${exams.data?.length ?? 0} اختبار إلكتروني`} aside={<Button size="sm" onClick={openCreate}><Plus className="size-4" />اختبار جديد</Button>} />
      <Tabs defaultValue="exams" dir="rtl">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="exams">الاختبارات</TabsTrigger><TabsTrigger value="review">التصحيح</TabsTrigger></TabsList>
        <TabsContent value="exams" className="space-y-3 pt-3">
          {!exams.data?.length ? <EmptyState text="لا توجد امتحانات إلكترونية بعد." /> : exams.data.map((exam) => {
            const count = submissions.data?.filter((s) => s.exam_id === exam.id).length ?? 0;
            return <div key={exam.id} className="rounded-lg bg-card p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{exam.title}</h3><Badge variant={exam.publish_status === "published" ? "default" : "secondary"}>{exam.publish_status === "published" ? "منشور" : "مسودة"}</Badge>{exam.is_closed ? <Badge variant="destructive">مغلق</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{exam.kind === "online" ? "اختيار من متعدد وصح/خطأ" : "مقالي"} • {count} إجابة</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(exam.id)}><Pencil className="size-4" />تعديل</Button>{exam.publish_status === "draft" ? <Button size="sm" onClick={() => publish.mutate(exam.id)} disabled={publish.isPending}><Send className="size-4" />نشر الاختبار</Button> : null}<Button size="sm" variant="outline" onClick={() => toggleClosed.mutate({ id: exam.id, closed: !exam.is_closed })} disabled={toggleClosed.isPending}>{exam.is_closed ? <><LockOpen className="size-4" />فتح</> : <><Lock className="size-4" />قفل</>}</Button><Button size="sm" variant="ghost" className="text-destructive" aria-label="حذف الاختبار" onClick={() => { if (confirm("حذف الاختبار وكل حلوله ودرجاته نهائيًا؟")) deleteExam.mutate(exam.id); }}><Trash2 className="size-4" /></Button></div></div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><Clock3 className="size-4" /><span>{!exam.starts_at && !exam.ends_at ? "مفتوح بدون موعد" : `${exam.starts_at ? new Date(exam.starts_at).toLocaleString("ar-EG") : "الآن"} — ${exam.ends_at ? new Date(exam.ends_at).toLocaleString("ar-EG") : "بدون نهاية"}`}</span></div>
            </div>;
          })}
        </TabsContent>
        <TabsContent value="review" className="space-y-3 pt-3">
          {!submissions.data?.length ? <EmptyState text="لا توجد إجابات للمراجعة بعد." /> : submissions.data.map((sub) => {
            const student = students.data?.find((s) => s.id === sub.student_id);
            const exam = exams.data?.find((e) => e.id === sub.exam_id);
            return <button key={sub.id} onClick={() => setReviewId(sub.id)} className="flex w-full items-center justify-between rounded-lg bg-card p-4 text-right ring-1 ring-border"><div><p className="font-medium">{student?.full_name ?? "طالب"}</p><p className="text-xs text-muted-foreground">{exam?.title ?? "اختبار"}</p></div><Badge variant={sub.status === "graded" ? "default" : "secondary"}>{sub.status === "graded" ? `تم التصحيح: ${sub.final_score ?? 0}` : sub.status === "submitted" ? "بانتظار التصحيح" : "جارٍ الحل"}</Badge></button>;
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={(value) => { if (!value) closeDialog(); else setOpen(true); }}><DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="text-right">{editExamId ? "تعديل الاختبار" : "إنشاء اختبار جديد"}</DialogTitle></DialogHeader><div className="space-y-5">
        {!editExamId ? <div className="grid grid-cols-2 gap-2"><Button variant={kind === "online" ? "default" : "outline"} onClick={() => changeKind("online")}>اختيار وصح/خطأ</Button><Button variant={kind === "essay" ? "default" : "outline"} onClick={() => changeKind("essay")}>مقالي</Button></div> : null}
        <Field label="اسم الاختبار"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="اسم الاختبار" /></Field>
        <Field label="صورة ورقة الاختبار (اختياري)"><div className="grid grid-cols-2 gap-2"><label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-card text-sm">تصوير بالكاميرا<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} /></label><label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-card text-sm">اختيار من المعرض<input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} /></label></div>{imageFile ? <img src={URL.createObjectURL(imageFile)} alt="معاينة" className="mt-2 max-h-48 rounded-md ring-1 ring-border" /> : editExamId && editing.data?.imageUrlPreview && existingImageUrl ? <div className="mt-2"><img src={editing.data.imageUrlPreview} alt="الصورة الحالية" className="max-h-48 rounded-md ring-1 ring-border" /><Button size="sm" variant="ghost" className="mt-1" onClick={() => setExistingImageUrl(null)}>إزالة الصورة الحالية</Button></div> : <p className="text-xs text-muted-foreground">صوّر الاختبار الورقي أو ارفع صورته ليظهر للطالب مع الأسئلة.</p>}</Field>
        <Field label="تعليمات الاختبار"><Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1000} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="بداية الاختبار (اختياري)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field><Field label="نهاية الاختبار (اختياري)"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Selection title="تعيين لمجموعات" items={(groups.data ?? []).map((g) => ({ id: g.id, label: g.name }))} selected={groupIds} onToggle={(id) => toggle(groupIds, id, setGroupIds)} /><Selection title="تعيين لطلاب محددين" items={(students.data ?? []).map((s) => ({ id: s.id, label: s.full_name }))} selected={studentIds} onToggle={(id) => toggle(studentIds, id, setStudentIds)} /></div>
        <div className="space-y-3"><div className="flex items-center justify-between"><Label>الأسئلة</Label><Button size="sm" variant="outline" onClick={() => setQuestions((q) => [...q, blankQuestion(kind)])}><Plus className="size-4" />سؤال</Button></div>{questions.map((q, index) => <div key={index} className="space-y-3 rounded-lg bg-secondary p-3"><div className="flex gap-2"><Input value={q.prompt} onChange={(e) => updateQuestion(index, { prompt: e.target.value })} placeholder={`السؤال ${index + 1}`} /><Input className="w-20" type="number" min={1} value={q.points} onChange={(e) => updateQuestion(index, { points: e.target.value })} /><Button size="icon" variant="ghost" className="size-10 shrink-0 text-destructive" aria-label={`حذف السؤال ${index + 1}`} onClick={() => removeQuestion(index)}>×</Button></div>{kind === "online" ? <><select value={q.type} onChange={(e) => updateQuestion(index, { type: e.target.value as Question["type"], options: e.target.value === "true_false" ? ["صح", "خطأ"] : ["", "", "", ""], correct: "0" })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="mcq">اختيار من متعدد</option><option value="true_false">صح أو خطأ</option></select><div className="grid grid-cols-2 gap-2">{q.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2"><input type="radio" name={`correct-${editExamId ?? "new"}-${index}`} checked={q.correct === String(optionIndex)} onChange={() => updateQuestion(index, { correct: String(optionIndex) })} /><Input value={option} disabled={q.type === "true_false"} onChange={(e) => updateQuestion(index, { options: q.options.map((item, i) => i === optionIndex ? e.target.value : item) })} placeholder={`اختيار ${optionIndex + 1}`} /></label>)}</div></> : <p className="text-xs text-muted-foreground">سيظهر للطالب حقل كتابة، وتُراجع الإجابة يدويًا.</p>}</div>)}</div>
        <Button className="w-full" disabled={saveExam.isPending} onClick={() => saveExam.mutate()}>{saveExam.isPending ? "جارٍ الحفظ..." : editExamId ? "حفظ التعديلات" : "حفظ كمسودة"}</Button>
      </div></DialogContent></Dialog>

      <Dialog open={Boolean(reviewId)} onOpenChange={(value) => !value && setReviewId(null)}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-right">مراجعة إجابة الطالب</DialogTitle></DialogHeader><div className="space-y-3">{review.data?.map((answer) => { const q = answer.exam_questions as { prompt: string; points: number; question_type: string } | null; return <div key={answer.id} className="space-y-2 rounded-lg bg-secondary p-3"><p className="font-medium">{q?.prompt}</p><p className="whitespace-pre-wrap rounded-md bg-card p-3 text-sm">{answer.answer_text || "بدون إجابة"}</p>{q?.question_type === "essay" ? <Field label={`الدرجة من ${q.points}`}><Input type="number" min={0} max={q.points} defaultValue={answer.points_awarded ?? ""} onBlur={(e) => void saveAnswerGrade(answer.id, Number(e.target.value), q.points)} /></Field> : <p className="text-xs text-muted-foreground">تم التصحيح تلقائيًا: {answer.points_awarded ?? 0} / {q?.points ?? 0}</p>}</div>; })}<Button className="w-full" onClick={async () => { if (!reviewId) return; try { await finishEssay({ data: { submissionId: reviewId } }); toast.success("تم اعتماد الدرجة"); setReviewId(null); qc.invalidateQueries({ queryKey: ["exam-submissions"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر اعتماد الدرجة"); } }}><CheckCircle2 className="size-4" />اعتماد التصحيح</Button></div></DialogContent></Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Selection({ title, items, selected, onToggle }: { title: string; items: { id: string; label: string }[]; selected: string[]; onToggle: (id: string) => void }) { return <div className="space-y-2"><Label>{title}</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">{items.length ? items.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => onToggle(item.id)} />{item.label}</label>) : <span className="text-xs text-muted-foreground">لا توجد بيانات</span>}</div></div>; }
