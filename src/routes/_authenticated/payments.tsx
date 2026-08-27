import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle, StatCard } from "@/components/AppShell";
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
import { currentMonth, fetchGroups, fetchStudents, formatMoney, type Payment } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "المدفوعات والمتأخرات | حصتي" },
      {
        name: "description",
        content: "سجّل الاشتراكات الشهرية والمدفوع والمتبقي وتابع متأخرات الطلاب.",
      },
      { property: "og:title", content: "المدفوعات والمتأخرات | حصتي" },
      { property: "og:description", content: "متابعة اشتراكات الطلاب والمتأخرات المالية." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [amountDue, setAmountDue] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");

  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });
  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });

  const payments = useQuery({
    queryKey: ["payments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, student_id, month, amount_due, amount_paid, paid_at")
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const savePayment = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!studentId) throw new Error("اختر الطالب");
      const { error } = await supabase.from("payments").insert({
        teacher_id: auth.user.id,
        student_id: studentId,
        month,
        amount_due: Number(amountDue) || 0,
        amount_paid: Number(amountPaid) || 0,
        paid_at: Number(amountPaid) > 0 ? new Date().toISOString().slice(0, 10) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments-list"] });
      queryClient.invalidateQueries({ queryKey: ["payments", currentMonth()] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string) =>
    students.data?.find((s) => s.id === id)?.full_name ?? "طالب محذوف";

  const totalDue = (payments.data ?? []).reduce(
    (sum, p) => sum + Math.max(Number(p.amount_due) - Number(p.amount_paid), 0),
    0,
  );
  const totalPaid = (payments.data ?? []).reduce((sum, p) => sum + Number(p.amount_paid), 0);

  function pickStudent(id: string) {
    setStudentId(id);
    const student = students.data?.find((s) => s.id === id);
    const group = groups.data?.find((g) => g.id === student?.group_id);
    if (group) setAmountDue(String(Number(group.fee)));
  }

  return (
    <AppShell title="المالية" subtitle="المدفوعات والمتأخرات">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="إجمالي المحصّل" value={`${formatMoney(totalPaid)} ج.م`} tone="success" />
        <StatCard label="إجمالي المتأخرات" value={`${formatMoney(totalDue)} ج.م`} tone="destructive" />
      </section>

      <SectionTitle
        title="سجل الدفعات"
        aside={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">تسجيل دفعة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">دفعة جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>الطالب</Label>
                  <select
                    value={studentId}
                    onChange={(e) => pickStudent(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  >
                    <option value="">اختر الطالب</option>
                    {(students.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>شهر الاشتراك</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>قيمة الاشتراك</Label>
                    <Input
                      type="number"
                      min={0}
                      value={amountDue}
                      onChange={(e) => setAmountDue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>المدفوع</Label>
                    <Input
                      type="number"
                      min={0}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={savePayment.isPending}
                  onClick={() => savePayment.mutate()}
                >
                  حفظ الدفعة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {(payments.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا توجد دفعات مسجلة بعد." />
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border bg-secondary/60">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">الطالب</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">الشهر</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">المدفوع</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">المتبقي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(payments.data ?? []).map((payment) => {
                const rest = Math.max(Number(payment.amount_due) - Number(payment.amount_paid), 0);
                return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 font-medium">{nameOf(payment.student_id)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{payment.month}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(Number(payment.amount_paid))}</td>
                    <td
                      className={`px-4 py-3 font-semibold tabular-nums ${
                        rest > 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {formatMoney(rest)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
