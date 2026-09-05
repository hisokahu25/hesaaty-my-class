import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import {
  fetchGroups,
  fetchStudents,
  formatDateAr,
  initials,
  todayISO,
  type AttendanceStatus,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/attendance")({
  validateSearch: (search: Record<string, unknown>) => ({
    group: typeof search["group"] === "string" ? search["group"] : "",
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الحضور | حصتي" },
      {
        name: "description",
        content: "سجّل حضور وغياب وتأخير الطلاب بضغطة واحدة وتابع نسبة حضور كل طالب.",
      },
      { property: "og:title", content: "تسجيل الحضور | حصتي" },
      { property: "og:description", content: "واجهة سريعة لتسجيل الحضور والغياب والتأخير." },
    ],
  }),
  component: AttendancePage,
});

const OPTIONS: { status: AttendanceStatus; short: string; active: string }[] = [
  { status: "present", short: "ح", active: "bg-primary/10 text-primary ring-primary/30" },
  { status: "absent", short: "غ", active: "bg-destructive/10 text-destructive ring-destructive/30" },
  { status: "late", short: "ت", active: "bg-accent/20 text-accent-foreground ring-accent/40" },
];

function AttendancePage() {
  const { group } = Route.useSearch();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [groupId, setGroupId] = useState(group);

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });

  const records = useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("session_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const allRecords = useQuery({
    queryKey: ["attendance-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("student_id, status");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mark = useMutation({
    mutationFn: async ({
      studentId,
      status,
      studentGroup,
    }: {
      studentId: string;
      status: AttendanceStatus;
      studentGroup: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      const { error } = await supabase.from("attendance").upsert(
        {
          teacher_id: auth.user.id,
          student_id: studentId,
          group_id: studentGroup,
          session_date: date,
          status,
        },
        { onConflict: "student_id,session_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", date] });
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = (students.data ?? []).filter((s) => !groupId || s.group_id === groupId);

  const markAll = useMutation({
    mutationFn: async (status: AttendanceStatus) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (visible.length === 0) throw new Error("لا يوجد طلاب");
      const rows = visible.map((s) => ({
        teacher_id: auth.user!.id,
        student_id: s.id,
        group_id: s.group_id,
        session_date: date,
        status,
      }));
      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,session_date" });
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(status === "absent" ? "تم إلغاء الحصة وتسجيل غياب الجميع" : "تم تسجيل حضور الجميع");
      queryClient.invalidateQueries({ queryKey: ["attendance", date] });
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearDay = useMutation({
    mutationFn: async () => {
      const ids = visible.map((s) => s.id);
      if (ids.length === 0) throw new Error("لا يوجد طلاب");
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("session_date", date)
        .in("student_id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم مسح تسجيل هذا اليوم");
      queryClient.invalidateQueries({ queryKey: ["attendance", date] });
      queryClient.invalidateQueries({ queryKey: ["attendance-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusOf = (id: string) =>
    records.data?.find((r) => r.student_id === id)?.status as AttendanceStatus | undefined;

  const rateOf = (id: string) => {
    const rows = (allRecords.data ?? []).filter((r) => r.student_id === id);
    if (rows.length === 0) return null;
    const present = rows.filter((r) => r.status !== "absent").length;
    return Math.round((present / rows.length) * 100);
  };


  return (
    <AppShell title="الحضور" subtitle="تسجيل سريع للحضور">
      <div className="grid grid-cols-2 gap-3">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm"
        >
          <option value="">كل المجموعات</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={markAll.isPending || visible.length === 0}
          onClick={() => {
            if (window.confirm("سيتم تسجيل غياب كل طلاب هذه القائمة في هذا التاريخ (إلغاء الحصة). متأكد؟")) {
              markAll.mutate("absent");
            }
          }}
        >
          إلغاء الحصة
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={markAll.isPending || visible.length === 0}
          onClick={() => markAll.mutate("present")}
        >
          حضور الكل
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={clearDay.isPending || visible.length === 0}
          onClick={() => clearDay.mutate()}
        >
          مسح التسجيل
        </Button>
      </div>

      <SectionTitle title="تسجيل سريع للحضور" aside={formatDateAr(date)} />


      {visible.length === 0 ? (
        <EmptyState text="لا يوجد طلاب في هذه المجموعة." />
      ) : (
        <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
          {visible.map((student) => {
            const current = statusOf(student.id);
            const rate = rateOf(student.id);
            return (
              <div key={student.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                    {initials(student.full_name)}
                  </div>
                  <div>
                    <p className="text-base font-medium">{student.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rate === null ? "لا يوجد سجل حضور" : `نسبة الحضور: ${rate}٪`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {OPTIONS.map((option) => (
                    <button
                      key={option.status}
                      onClick={() =>
                        mark.mutate({
                          studentId: student.id,
                          status: option.status,
                          studentGroup: student.group_id,
                        })
                      }
                      className={`flex size-9 items-center justify-center rounded-lg text-xs font-bold ring-1 ${
                        current === option.status
                          ? option.active
                          : "bg-secondary text-muted-foreground ring-border"
                      }`}
                    >
                      {option.short}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
