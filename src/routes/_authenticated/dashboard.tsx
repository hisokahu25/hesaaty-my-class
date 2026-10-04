import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle, StatCard } from "@/components/AppShell";
import {
  currentMonth,
  fetchGroups,
  fetchStudents,
  formatDateAr,
  formatMoney,
  todayISO,
  todayName,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم المعلم | حصتي" },
      {
        name: "description",
        content: "تابع عدد الطلاب ومجموعات اليوم وحضورهم والمتأخرات والإيرادات في مكان واحد.",
      },
      { property: "og:title", content: "لوحة تحكم المعلم | حصتي" },
      {
        property: "og:description",
        content: "تابع عدد الطلاب ومجموعات اليوم والحضور والمتأخرات والإيرادات.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [showAbsences, setShowAbsences] = useState(false);
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });
  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });

  const attendance = useQuery({
    queryKey: ["attendance", todayISO()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("status")
        .eq("session_date", todayISO());
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthAttendance = useQuery({
    queryKey: ["attendance-month", currentMonth()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status, session_date")
        .gte("session_date", `${currentMonth()}-01`)
        .lte("session_date", `${currentMonth()}-31`)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const payments = useQuery({
    queryKey: ["payments", currentMonth()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount_due, amount_paid, discount, month");
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthRows = monthAttendance.data ?? [];
  const monthPresent = monthRows.filter((a) => a.status !== "absent").length;
  const monthAbsentRows = monthRows.filter((a) => a.status === "absent");
  const studentName = (id: string) =>
    (students.data ?? []).find((s) => s.id === id)?.full_name ?? "طالب";

  const studentCount = students.data?.length ?? 0;
  const todayGroups = (groups.data ?? []).filter((g) => g.days.includes(todayName()));
  const present = (attendance.data ?? []).filter((a) => a.status !== "absent").length;
  const absent = (attendance.data ?? []).filter((a) => a.status === "absent").length;
  const attendanceRate =
    (attendance.data?.length ?? 0) > 0
      ? Math.round((present / attendance.data!.length) * 100)
      : 0;

  const netDue = (p: { amount_due: number; discount: number }) =>
    Number(p.amount_due) - Number(p.discount ?? 0);
  const due = (payments.data ?? []).reduce(
    (sum, p) => sum + Math.max(netDue(p) - Number(p.amount_paid), 0),
    0,
  );
  const collected = (payments.data ?? [])
    .filter((p) => p.month === currentMonth())
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const debtors = (payments.data ?? []).filter(
    (p) => netDue(p) > Number(p.amount_paid),
  ).length;

  return (
    <AppShell title="حصتي" subtitle="لوحة تحكم المعلم">
      <section className="grid grid-cols-2 gap-3">
        <StatCard
          label="طلاب المجموعات"
          value={formatMoney(studentCount)}
          hint={`${formatMoney(groups.data?.length ?? 0)} مجموعة`}
          tone="success"
        />
        <StatCard
          label="حضور اليوم"
          value={`${formatMoney(attendanceRate)}٪`}
          hint={`${formatMoney(absent)} طلاب متغيبين`}
          tone="accent"
        />
        <StatCard
          label="إيرادات الشهر"
          value={`${formatMoney(collected)} ج.م`}
          tone="success"
        />
        <StatCard
          label="عدد الاختبارات"
          value={formatMoney(todayGroups.length)}
          hint="مجموعات اليوم"
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatCard
          label="حضور الشهر"
          value={formatMoney(monthPresent)}
          hint="تسجيل حضور وتأخير"
          tone="success"
        />
        <button type="button" onClick={() => setShowAbsences((v) => !v)} className="text-start">
          <StatCard
            label="غياب الشهر"
            value={formatMoney(monthAbsentRows.length)}
            hint={showAbsences ? "اضغط لإخفاء القائمة" : "اضغط لعرض الغائبين"}
            tone="destructive"
          />
        </button>
      </section>

      {showAbsences ? (
        <section className="space-y-3">
          <SectionTitle title="غائبو هذا الشهر" aside={currentMonth()} />
          {monthAbsentRows.length === 0 ? (
            <EmptyState text="لا يوجد غياب مسجل هذا الشهر." />
          ) : (
            <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
              {monthAbsentRows.map((row, i) => (
                <div key={`${row.student_id}-${row.session_date}-${i}`} className="flex items-center justify-between p-3">
                  <p className="text-sm font-medium">{studentName(row.student_id)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateAr(row.session_date)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionTitle title="حصص اليوم" aside={formatDateAr(todayISO())} />
        {todayGroups.length === 0 ? (
          <EmptyState text="لا توجد حصص مجدولة اليوم. أضف مجموعة من صفحة الجدول." />
        ) : (
          <div className="space-y-3">
            {todayGroups.map((group) => (
              <div
                key={group.id}
                className="overflow-hidden rounded-xl bg-card ring-1 ring-border"
              >
                <div className="flex items-start justify-between border-b border-border p-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {group.grade || "بدون صف"}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {group.subject || "بدون مادة"}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold">{group.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      الساعة {group.start_time.slice(0, 5)} • {group.location || "غير محدد"}
                    </p>
                  </div>
                  <div className="text-left">
                    <span className="text-lg font-semibold text-primary">
                      {formatMoney(Number(group.fee))} ج.م
                    </span>
                    <p className="text-[10px] text-muted-foreground">قيمة الاشتراك</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-2">
                  <Link
                    to="/attendance"
                    search={{ group: group.id }}
                    className="flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    تسجيل الحضور
                  </Link>
                  <Link
                    to="/grades"
                    className="flex items-center justify-center rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border"
                  >
                    الدرجات
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl bg-ink p-5 text-ink-foreground shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium opacity-80">إجمالي المتأخرات</h2>
          <span className="rounded-md bg-ink-foreground/10 px-2 py-1 text-xs">
            {formatMoney(debtors)} طالب
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{formatMoney(due)}</span>
          <span className="text-sm opacity-60">جنيه مصري</span>
        </div>
        <div className="mt-6 border-t border-ink-foreground/10 pt-4">
          <Link
            to="/payments"
            className="flex w-full items-center justify-center text-sm font-medium text-accent"
          >
            عرض قائمة المدفوعات
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
