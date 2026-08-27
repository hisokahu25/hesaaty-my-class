import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchGroups, fetchStudents, formatDateAr, todayISO, type Exam } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/grades")({
  head: () => ({
    meta: [
      { title: "الاختبارات والدرجات | حصتي" },
      {
        name: "description",
        content: "أنشئ اختبارات لمجموعاتك وسجّل درجات الطلاب وتابع مستواهم بسهولة.",
      },
      { property: "og:title", content: "الاختبارات والدرجات | حصتي" },
      { property: "og:description", content: "تسجيل درجات الطلاب ومتابعة نتائج الاختبارات." },
    ],
  }),
  component: GradesPage,
});

function GradesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [examDate, setExamDate] = useState(todayISO());
  const [activeExam, setActiveExam] = useState<string>("");

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });

  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, group_id, title, max_score, exam_date")
        .order("exam_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Exam[];
    },
  });

  const grades = useQuery({
    queryKey: ["grades", activeExam],
    enabled: Boolean(activeExam),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("student_id, score")
        .eq("exam_id", activeExam);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addExam = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!title.trim()) throw new Error("اسم الاختبار مطلوب");
      const { error } = await supabase.from("exams").insert({
        teacher_id: auth.user.id,
        group_id: groupId || null,
        title: title.trim().slice(0, 100),
        max_score: Number(maxScore) || 100,
        exam_date: examDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنشاء الاختبار");
      setTitle("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGrade = useMutation({
    mutationFn: async ({ studentId, score }: { studentId: string; score: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      const { error } = await supabase.from("grades").upsert(
        {
          teacher_id: auth.user.id,
          exam_id: activeExam,
          student_id: studentId,
          score,
        },
        { onConflict: "exam_id,student_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grades", activeExam] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const exam = exams.data?.find((e) => e.id === activeExam);
  const examStudents = (students.data ?? []).filter(
    (s) => !exam?.group_id || s.group_id === exam.group_id,
  );
  const scoreOf = (id: string) => grades.data?.find((g) => g.student_id === id)?.score ?? "";

  return (
    <AppShell title="الدرجات" subtitle="الاختبارات ونتائج الطلاب">
      <SectionTitle
        title={`${exams.data?.length ?? 0} اختبار`}
        aside={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">اختبار جديد</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">اختبار جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>اسم الاختبار</Label>
                  <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>المجموعة</Label>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  >
                    <option value="">كل الطلاب</option>
                    {(groups.data ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>الدرجة النهائية</Label>
                    <Input
                      type="number"
                      min={1}
                      value={maxScore}
                      onChange={(e) => setMaxScore(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>التاريخ</Label>
                    <Input
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                  </div>
                </div>
                <Button className="w-full" disabled={addExam.isPending} onClick={() => addExam.mutate()}>
                  إنشاء
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {(exams.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا توجد اختبارات بعد." />
      ) : (
        <div className="space-y-2">
          {(exams.data ?? []).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveExam(item.id === activeExam ? "" : item.id)}
              className={`w-full rounded-xl p-4 text-right ring-1 transition-colors ${
                item.id === activeExam
                  ? "bg-primary/5 ring-primary/40"
                  : "bg-card ring-border hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateAr(item.exam_date)}</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  من {item.max_score}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {exam ? (
        <>
          <SectionTitle title={`درجات: ${exam.title}`} />
          {examStudents.length === 0 ? (
            <EmptyState text="لا يوجد طلاب في مجموعة هذا الاختبار." />
          ) : (
            <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
              {examStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between gap-3 p-3">
                  <p className="text-base font-medium">{student.full_name}</p>
                  <Input
                    type="number"
                    min={0}
                    max={exam.max_score}
                    defaultValue={String(scoreOf(student.id))}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isNaN(value) || e.target.value === "") return;
                      saveGrade.mutate({
                        studentId: student.id,
                        score: Math.min(Math.max(value, 0), exam.max_score),
                      });
                    }}
                    className="w-24 text-center tabular-nums"
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
