import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle, StatCard } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  currentMonth,
  fetchGroups,
  fetchStudents,
  formatMoney,
  todayISO,
  type AttendanceStatus,
  type Exam,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "الإحصائيات والتقارير | حصتي" },
      {
        name: "description",
        content:
          "حلّل بيانات الدرجات والحضور والماليات حسب المجموعة والفترة الزمنية في تقارير واضحة.",
      },
      { property: "og:title", content: "الإحصائيات والتقارير | حصتي" },
      {
        property: "og:description",
        content: "تقارير الدرجات والحضور والماليات حسب المجموعة والفترة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatsPage,
});

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground";

function monthStart() {
  return `${currentMonth()}-01`;
}

function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatsPage() {
  const [groupId, setGroupId] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });

  const studentList = useMemo(
    () => (students.data ?? []).filter((s) => (groupId ? s.group_id === groupId : true)),
    [students.data, groupId],
  );
  const studentIds = useMemo(() => new Set(studentList.map((s) => s.id)), [studentList]);
  const nameOf = (id: string) =>
    (students.data ?? []).find((s) => s.id === id)?.full_name ?? "طالب";

  const attendance = useQuery({
    queryKey: ["stats-attendance", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, group_id, session_date, status")
        .gte("session_date", from)
        .lte("session_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const exams = useQuery({
    queryKey: ["stats-exams", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, group_id, title, max_score, exam_date")
        .gte("exam_date", from)
        .lte("exam_date", to);
      if (error) throw error;
      return (data ?? []) as Exam[];
    },
  });

  const grades = useQuery({
    queryKey: ["stats-grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("exam_id, student_id, score");
      if (error) throw error;
      return data ?? [];
    },
  });

  const payments = useQuery({
    queryKey: ["stats-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("student_id, month, amount_due, amount_paid");
      if (error) throw error;
      return data ?? [];
    },
  });

  // الحضور
  const attRows = (attendance.data ?? []).filter((a) =>
    groupId ? a.group_id === groupId || studentIds.has(a.student_id) : true,
  );
  const counts: Record<AttendanceStatus, number> = {
    present: attRows.filter((a) => a.status === "present").length,
    late: attRows.filter((a) => a.status === "late").length,
    absent: attRows.filter((a) => a.status === "absent").length,
  };
  const attTotal = attRows.length;
  const attRate = attTotal ? Math.round(((counts.present + counts.late) / attTotal) * 100) : 0;
  const worst = studentList
    .map((s) => {
      const rows = attRows.filter((a) => a.student_id === s.id);
      const abs = rows.filter((a) => a.status === "absent").length;
      return { name: s.full_name, abs, total: rows.length };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 5);

  // الدرجات
  const examList = (exams.data ?? []).filter((e) => (groupId ? e.group_id === groupId : true));
  const examIds = new Set(examList.map((e) => e.id));
  const gradeRows = (grades.data ?? []).filter(
    (g) => examIds.has(g.exam_id) && (groupId ? studentIds.has(g.student_id) : true),
  );
  const maxById = new Map(examList.map((e) => [e.id, Number(e.max_score) || 100]));
  const percentages = gradeRows.map(
    (g) => (Number(g.score) / (maxById.get(g.exam_id) || 100)) * 100,
  );
  const avgPct = percentages.length
    ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
    : 0;
  const passed = percentages.filter((p) => p >= 50).length;
  const topStudents = Object.entries(
    gradeRows.reduce<Record<string, { sum: number; n: number }>>((acc, g) => {
      const pct = (Number(g.score) / (maxById.get(g.exam_id) || 100)) * 100;
      const cur = acc[g.student_id] ?? { sum: 0, n: 0 };
      acc[g.student_id] = { sum: cur.sum + pct, n: cur.n + 1 };
      return acc;
    }, {}),
  )
    .map(([id, v]) => ({ id, avg: Math.round(v.sum / v.n) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // الماليات
  const payRows = (payments.data ?? []).filter(
    (p) =>
      (groupId ? studentIds.has(p.student_id) : true) &&
      p.month >= from.slice(0, 7) &&
      p.month <= to.slice(0, 7),
  );
  const totalDue = payRows.reduce((s, p) => s + Number(p.amount_due), 0);
  const totalPaid = payRows.reduce((s, p) => s + Number(p.amount_paid), 0);
  const remaining = Math.max(totalDue - totalPaid, 0);
  const byMonth = Object.entries(
    payRows.reduce<Record<string, { paid: number; due: number }>>((acc, p) => {
      const cur = acc[p.month] ?? { paid: 0, due: 0 };
      acc[p.month] = {
        paid: cur.paid + Number(p.amount_paid),
        due: cur.due + Number(p.amount_due),
      };
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => v.due));

  return (
    <AppShell title="الإحصائيات" subtitle="تقارير حسب البيانات المختارة">
      <section className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-border sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>المجموعة</Label>
          <select
            className={selectClass}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">كل المجموعات</option>
            {(groups.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>من تاريخ</Label>
          <input
            type="date"
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>إلى تاريخ</Label>
          <input
            type="date"
            className={selectClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </section>

      <Tabs defaultValue="grades" dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grades">الدرجات</TabsTrigger>
          <TabsTrigger value="attendance">الحضور</TabsTrigger>
          <TabsTrigger value="finance">الماليات</TabsTrigger>
        </TabsList>

        <TabsContent value="grades" className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <StatCard label="متوسط الدرجات" value={`${formatMoney(avgPct)}٪`} tone="accent" />
            <StatCard
              label="نسبة النجاح"
              value={`${formatMoney(
                percentages.length ? Math.round((passed / percentages.length) * 100) : 0,
              )}٪`}
              hint={`${formatMoney(percentages.length)} درجة مسجلة`}
              tone="success"
            />
            <StatCard label="عدد الاختبارات" value={formatMoney(examList.length)} />
            <StatCard label="عدد الطلاب" value={formatMoney(studentList.length)} />
          </section>
          <SectionTitle title="الأعلى تقييمًا" />
          {topStudents.length === 0 ? (
            <EmptyState text="لا توجد درجات مسجلة ضمن الفترة والمجموعة المختارة." />
          ) : (
            <div className="space-y-2">
              {topStudents.map((s) => (
                <Bar
                  key={s.id}
                  label={nameOf(s.id)}
                  value={s.avg}
                  max={100}
                  hint={`${formatMoney(s.avg)}٪`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <StatCard label="نسبة الحضور" value={`${formatMoney(attRate)}٪`} tone="success" />
            <StatCard label="عدد الجلسات المسجلة" value={formatMoney(attTotal)} />
            <StatCard label="حالات الغياب" value={formatMoney(counts.absent)} tone="destructive" />
            <StatCard label="حالات التأخير" value={formatMoney(counts.late)} tone="accent" />
          </section>
          <SectionTitle title="الأكثر غيابًا" />
          {worst.length === 0 ? (
            <EmptyState text="لا يوجد تسجيل حضور ضمن الفترة والمجموعة المختارة." />
          ) : (
            <div className="space-y-2">
              {worst.map((s) => (
                <Bar
                  key={s.name}
                  label={s.name}
                  value={s.abs}
                  max={Math.max(...worst.map((w) => w.abs), 1)}
                  hint={`${formatMoney(s.abs)} من ${formatMoney(s.total)}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <StatCard label="المحصّل" value={`${formatMoney(totalPaid)} ج.م`} tone="success" />
            <StatCard label="المتأخرات" value={`${formatMoney(remaining)} ج.م`} tone="destructive" />
            <StatCard label="إجمالي المستحق" value={`${formatMoney(totalDue)} ج.م`} />
            <StatCard
              label="نسبة التحصيل"
              value={`${formatMoney(totalDue ? Math.round((totalPaid / totalDue) * 100) : 0)}٪`}
              tone="accent"
            />
          </section>
          <SectionTitle title="التحصيل حسب الشهر" />
          {byMonth.length === 0 ? (
            <EmptyState text="لا توجد مدفوعات ضمن الفترة والمجموعة المختارة." />
          ) : (
            <div className="space-y-2">
              {byMonth.map(([month, v]) => (
                <Bar
                  key={month}
                  label={month}
                  value={v.paid}
                  max={maxMonth}
                  hint={`${formatMoney(v.paid)} / ${formatMoney(v.due)} ج.م`}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
