import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Clock3, FileText, Plus, Send } from "lucide-react";
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
  const [reviewId, setReviewId] = useState<string | null>(null);

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });
  const exams = useQuery({
    queryKey: ["digital-exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams")
        .select("id,title,kind,max_score,publish_status,starts_at,ends_at,created_at")
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

  const createExam = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!title.trim() || !startsAt || !endsAt) throw new Error("أكمل اسم وموعد الاختبار");
      if (!questions.length || questions.some((q) => !q.prompt.trim())) throw new Error("أكمل نصوص الأسئلة");
      if (!groupIds.length && !studentIds.length) throw new Error("اختر مجموعة أو طالبًا واحدًا على الأقل");
      const total = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
      const { data: exam, error } = await supabase.from("exams").insert({
        teacher_id: auth.user.id, title: title.trim(), kind, instructions: instructions.trim(),
        max_score: total, exam_date: startsAt.slice(0, 10), starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(), publish_status: "draft",
      }).select("id").single();
      if (error) throw error;
      const { data: insertedQuestions, error: questionError } = await supabase.from("exam_questions").insert(
        questions.map((q, index) => ({ exam_id: exam.id, teacher_id: auth.user.id, question_type: q.type,
          prompt: q.prompt.trim(), points: Number(q.points) || 1, position: index,
          options: q.type === "true_false" ? ["صح", "خطأ"] : q.options.filter(Boolean) })),
      ).select("id,position");
      if (questionError) throw questionError;
      const keys = (insertedQuestions ?? []).flatMap((row) => {
        const q = questions[row.position];
        return q && q.type !== "essay" ? [{ question_id: row.id, teacher_id: auth.user.id, correct_answer: q.correct }] : [];
      });
      if (keys.length) {
        const { error: keyError } = await supabase.from("exam_answer_keys").insert(keys);
        if (keyError) throw keyError;
      }
      const assignments = [
        ...groupIds.map((group_id) => ({ exam_id: exam.id, teacher_id: auth.user.id, group_id })),
        ...studentIds.map((student_id) => ({ exam_id: exam.id, teacher_id: auth.user.id, student_id })),
      ];
      const { error: assignmentError } = await supabase.from("exam_assignments").insert(assignments);
      if (assignmentError) throw assignmentError;
    },
    onSuccess: () => {
      toast.success("تم حفظ الاختبار كمسودة"); setOpen(false); setTitle(""); setInstructions("");
      setGroupIds([]); setStudentIds([]); setQuestions([blankQuestion(kind)]); qc.invalidateQueries({ queryKey: ["digital-exams"] });
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

  async function saveAnswerGrade(answerId: string, points: number, max: number) {
    const { error } = await supabase.from("exam_answers").update({ points_awarded: Math.min(Math.max(points, 0), max) }).eq("id", answerId);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["submission-review", reviewId] });
  }

  function changeKind(next: ExamKind) { setKind(next); setQuestions([blankQuestion(next)]); }
  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((q, i) => i === index ? { ...q, ...patch } : q));
  }
  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }

  return (
    <AppShell title="الامتحانات" subtitle="إنشاء ونشر ومراجعة الاختبارات">
      <SectionTitle title={`${exams.data?.length ?? 0} اختبار إلكتروني`} aside={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />اختبار جديد</Button>} />
      <Tabs defaultValue="exams" dir="rtl">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="exams">الاختبارات</TabsTrigger><TabsTrigger value="review">التصحيح</TabsTrigger></TabsList>
        <TabsContent value="exams" className="space-y-3 pt-3">
          {!exams.data?.length ? <EmptyState text="لا توجد امتحانات إلكترونية بعد." /> : exams.data.map((exam) => {
            const count = submissions.data?.filter((s) => s.exam_id === exam.id).length ?? 0;
            return <div key={exam.id} className="rounded-lg bg-card p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{exam.title}</h3><Badge variant={exam.publish_status === "published" ? "default" : "secondary"}>{exam.publish_status === "published" ? "منشور" : "مسودة"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{exam.kind === "online" ? "اختيار من متعدد وصح/خطأ" : "مقالي"} • {count} إجابة</p></div>{exam.publish_status === "draft" ? <Button size="sm" onClick={() => publish.mutate(exam.id)} disabled={publish.isPending}><Send className="size-4" />نشر الاختبار</Button> : null}</div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><Clock3 className="size-4" /><span>{exam.starts_at ? new Date(exam.starts_at).toLocaleString("ar-EG") : "—"} — {exam.ends_at ? new Date(exam.ends_at).toLocaleString("ar-EG") : "—"}</span></div>
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

      <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="text-right">إنشاء اختبار جديد</DialogTitle></DialogHeader><div className="space-y-5">
        <div className="grid grid-cols-2 gap-2"><Button variant={kind === "online" ? "default" : "outline"} onClick={() => changeKind("online")}>اختيار وصح/خطأ</Button><Button variant={kind === "essay" ? "default" : "outline"} onClick={() => changeKind("essay")}>مقالي</Button></div>
        <Field label="اسم الاختبار"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></Field>
        <Field label="تعليمات الاختبار"><Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1000} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="بداية الاختبار"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field><Field label="نهاية الاختبار"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Selection title="تعيين لمجموعات" items={(groups.data ?? []).map((g) => ({ id: g.id, label: g.name }))} selected={groupIds} onToggle={(id) => toggle(groupIds, id, setGroupIds)} /><Selection title="تعيين لطلاب محددين" items={(students.data ?? []).map((s) => ({ id: s.id, label: s.full_name }))} selected={studentIds} onToggle={(id) => toggle(studentIds, id, setStudentIds)} /></div>
        <div className="space-y-3"><div className="flex items-center justify-between"><Label>الأسئلة</Label><Button size="sm" variant="outline" onClick={() => setQuestions((q) => [...q, blankQuestion(kind)])}><Plus className="size-4" />سؤال</Button></div>{questions.map((q, index) => <div key={index} className="space-y-3 rounded-lg bg-secondary p-3"><div className="flex gap-2"><Input value={q.prompt} onChange={(e) => updateQuestion(index, { prompt: e.target.value })} placeholder={`السؤال ${index + 1}`} /><Input className="w-20" type="number" min={1} value={q.points} onChange={(e) => updateQuestion(index, { points: e.target.value })} /></div>{kind === "online" ? <><select value={q.type} onChange={(e) => updateQuestion(index, { type: e.target.value as Question["type"], options: e.target.value === "true_false" ? ["صح", "خطأ"] : ["", "", "", ""], correct: "0" })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="mcq">اختيار من متعدد</option><option value="true_false">صح أو خطأ</option></select><div className="grid grid-cols-2 gap-2">{q.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2"><input type="radio" name={`correct-${index}`} checked={q.correct === String(optionIndex)} onChange={() => updateQuestion(index, { correct: String(optionIndex) })} /><Input value={option} disabled={q.type === "true_false"} onChange={(e) => updateQuestion(index, { options: q.options.map((item, i) => i === optionIndex ? e.target.value : item) })} placeholder={`اختيار ${optionIndex + 1}`} /></label>)}</div></> : <p className="text-xs text-muted-foreground">سيظهر للطالب حقل كتابة، وتُراجع الإجابة يدويًا.</p>}</div>)}</div>
        <Button className="w-full" disabled={createExam.isPending} onClick={() => createExam.mutate()}>{createExam.isPending ? "جارٍ الحفظ..." : "حفظ كمسودة"}</Button>
      </div></DialogContent></Dialog>

      <Dialog open={Boolean(reviewId)} onOpenChange={(value) => !value && setReviewId(null)}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-right">مراجعة إجابة الطالب</DialogTitle></DialogHeader><div className="space-y-3">{review.data?.map((answer) => { const q = answer.exam_questions as { prompt: string; points: number; question_type: string } | null; return <div key={answer.id} className="space-y-2 rounded-lg bg-secondary p-3"><p className="font-medium">{q?.prompt}</p><p className="whitespace-pre-wrap rounded-md bg-card p-3 text-sm">{answer.answer_text || "بدون إجابة"}</p>{q?.question_type === "essay" ? <Field label={`الدرجة من ${q.points}`}><Input type="number" min={0} max={q.points} defaultValue={answer.points_awarded ?? ""} onBlur={(e) => void saveAnswerGrade(answer.id, Number(e.target.value), q.points)} /></Field> : <p className="text-xs text-muted-foreground">تم التصحيح تلقائيًا: {answer.points_awarded ?? 0} / {q?.points ?? 0}</p>}</div>; })}<Button className="w-full" onClick={async () => { if (!reviewId) return; try { await finishEssay({ data: { submissionId: reviewId } }); toast.success("تم اعتماد الدرجة"); setReviewId(null); qc.invalidateQueries({ queryKey: ["exam-submissions"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر اعتماد الدرجة"); } }}><CheckCircle2 className="size-4" />اعتماد التصحيح</Button></div></DialogContent></Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Selection({ title, items, selected, onToggle }: { title: string; items: { id: string; label: string }[]; selected: string[]; onToggle: (id: string) => void }) { return <div className="space-y-2"><Label>{title}</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">{items.length ? items.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => onToggle(item.id)} />{item.label}</label>) : <span className="text-xs text-muted-foreground">لا توجد بيانات</span>}</div></div>; }