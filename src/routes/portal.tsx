import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { changePortalPassword, getPortalExam, getStudentPortal, loginStudentPortal, submitPortalExam } from "@/lib/student-portal.functions";

type PortalData = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getStudentPortal>>>>;

export const Route = createFileRoute("/portal")({
  ssr: false,
  head: () => ({ meta: [
    { title: "بوابة الطالب وولي الأمر | حصتي" },
    { name: "description", content: "دخول الطالب وولي الأمر للاختبارات والنتائج في حصتي." },
    { property: "og:title", content: "بوابة الطالب وولي الأمر | حصتي" },
    { property: "og:description", content: "الاختبارات والنتائج الخاصة بالطالب." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PortalPage,
});

function PortalPage() {
  const login = useServerFn(loginStudentPortal);
  const loadPortal = useServerFn(getStudentPortal);
  const loadExam = useServerFn(getPortalExam);
  const submitExam = useServerFn(submitPortalExam);
  const updatePassword = useServerFn(changePortalPassword);
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [data, setData] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh(sessionToken: string) {
    try { setData(await loadPortal({ data: { token: sessionToken } })); }
    catch { localStorage.removeItem("hesaty_portal_token"); setToken(""); }
  }
  useEffect(() => { const saved = localStorage.getItem("hesaty_portal_token"); if (saved) { setToken(saved); void refresh(saved); } }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try { const result = await login({ data: { code: code.toUpperCase(), password } }); localStorage.setItem("hesaty_portal_token", result.token); setToken(result.token); await refresh(result.token); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدخول"); }
    finally { setLoading(false); }
  }
  async function openExam(examId: string) {
    try { setExam(await loadExam({ data: { token, examId } })); setAnswers({}); }
    catch (error) { toast.error(error instanceof Error ? error.message : "الاختبار غير متاح"); }
  }
  async function handleSubmit() {
    if (!exam) return;
    try { const result = await submitExam({ data: { token, examId: exam.exam.id, submissionId: exam.submissionId, answers: exam.questions.map((q: any) => ({ questionId: q.id, answer: answers[q.id] ?? "" })) } }); toast.success(result?.status === "graded" ? `تم التصحيح، درجتك ${result.final_score ?? 0}` : "تم تسليم الإجابات للمراجعة"); setExam(null); await refresh(token); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسليم الاختبار"); }
  }
  function logout() { localStorage.removeItem("hesaty_portal_token"); setToken(""); setData(null); }

  if (!token || !data) return <main className="flex min-h-screen items-center justify-center bg-background px-4"><div className="w-full max-w-sm"><div className="mb-6 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary text-2xl font-semibold text-primary-foreground">ح</div><h1 className="mt-3 text-2xl font-semibold">بوابة الطالب وولي الأمر</h1><p className="mt-1 text-sm text-muted-foreground">ادخل بكود الطالب وكلمة المرور</p></div><form onSubmit={handleLogin} className="space-y-4 rounded-lg bg-card p-5 ring-1 ring-border"><div className="space-y-2"><Label htmlFor="student-code">كود الطالب</Label><Input id="student-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} className="text-center font-mono text-lg" /></div><div className="space-y-2"><Label htmlFor="portal-password">كلمة المرور</Label><Input id="portal-password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} /></div><Button className="w-full" disabled={loading || code.length !== 6 || password.length < 4}>{loading ? "جارٍ الدخول..." : "دخول"}</Button></form></div></main>;

  return <div className="min-h-screen bg-background pb-12"><header className="border-b border-border bg-card"><div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4"><div><h1 className="text-xl font-semibold">{data.student.full_name}</h1><p className="text-xs text-muted-foreground">{data.student.grade || "الطالب"} • <span dir="ltr" className="font-mono">{data.student.student_code}</span></p></div><div className="flex gap-2"><Button size="icon" variant="outline" title="تغيير كلمة المرور" onClick={() => setSettingsOpen(true)}><Settings className="size-4" /></Button><Button size="icon" variant="outline" title="تسجيل الخروج" onClick={logout}><LogOut className="size-4" /></Button></div></div></header><main className="mx-auto max-w-3xl space-y-4 px-4 py-6"><div><h2 className="text-lg font-semibold">الاختبارات</h2><p className="text-sm text-muted-foreground">الاختبارات المعيّنة لهذا الطالب ونتائجها</p></div>{!data.exams.length ? <div className="rounded-lg bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-border">لا توجد اختبارات معيّنة حاليًا.</div> : data.exams.map((item: any) => { const now = Date.now(); const available = item.starts_at && item.ends_at && now >= new Date(item.starts_at).getTime() && now <= new Date(item.ends_at).getTime(); const status = item.submission?.status; return <div key={item.id} className="rounded-lg bg-card p-4 ring-1 ring-border"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BookOpen className="size-4 text-primary" /><h3 className="font-semibold">{item.title}</h3></div><p className="mt-1 text-xs text-muted-foreground">{item.kind === "essay" ? "اختبار مقالي" : "اختبار إلكتروني"} • من {item.max_score}</p></div><Badge variant={status === "graded" ? "default" : "secondary"}>{status === "graded" ? "تم التصحيح" : status === "submitted" ? "تم الحل" : "لم يُحل بعد"}</Badge></div>{status === "graded" ? <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm font-semibold text-primary"><CheckCircle2 className="size-4" />النتيجة: {item.submission.final_score} / {item.max_score}</div> : status === "submitted" ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">تم التسليم، والنتيجة بانتظار مراجعة المدرس.</p> : <div className="mt-3 flex items-center justify-between border-t border-border pt-3"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-4" />{new Date(item.starts_at).toLocaleString("ar-EG")}</span><Button size="sm" disabled={!available} onClick={() => void openExam(item.id)}>{available ? "بدء الاختبار" : "غير متاح الآن"}</Button></div>}</div>; })}</main>
    <Dialog open={Boolean(exam)} onOpenChange={(v) => !v && setExam(null)}><DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="text-right">{exam?.exam.title}</DialogTitle></DialogHeader><div className="space-y-4">{exam?.questions.map((q: any, index: number) => <div key={q.id} className="space-y-3 rounded-lg bg-secondary p-4"><p className="font-medium">{index + 1}. {q.prompt} <span className="text-xs text-muted-foreground">({q.points} درجة)</span></p>{q.question_type === "essay" ? <Textarea rows={6} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} /> : <div className="space-y-2">{(q.options as string[]).map((option, i) => <label key={i} className="flex cursor-pointer items-center gap-2 rounded-md bg-card p-3 ring-1 ring-border"><input type="radio" name={q.id} checked={answers[q.id] === String(i)} onChange={() => setAnswers({ ...answers, [q.id]: String(i) })} />{option}</label>)}</div>}</div>)}<Button className="w-full" onClick={() => void handleSubmit()}>تسليم الإجابات</Button></div></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle className="text-right">تغيير كلمة المرور</DialogTitle></DialogHeader><div className="space-y-3"><Label>كلمة المرور الجديدة</Label><Input type="password" dir="ltr" minLength={4} maxLength={72} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><Button className="w-full" disabled={newPassword.length < 4} onClick={async () => { try { await updatePassword({ data: { token, password: newPassword } }); toast.success("تم تغيير كلمة المرور"); setNewPassword(""); setSettingsOpen(false); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر التغيير"); } }}>حفظ كلمة المرور</Button></div></DialogContent></Dialog>
  </div>;
}