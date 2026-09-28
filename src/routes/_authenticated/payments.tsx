import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle, StatCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { currentMonth, fetchGroups, fetchStudents, formatMoney, type Payment } from "@/lib/db";

type ExpenseCategory = "rent" | "secretary" | "bonus" | "other";
const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  rent: "إيجارات",
  secretary: "سكرتير",
  bonus: "مكافآت",
  other: "مصروفات أخرى",
};

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
  const [editId, setEditId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  const [expOpen, setExpOpen] = useState(false);
  const [expEditId, setExpEditId] = useState<string | null>(null);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("rent");
  const [expAmount, setExpAmount] = useState("");
  const [expMonth, setExpMonth] = useState(currentMonth());
  const [expNotes, setExpNotes] = useState("");
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, category, amount, month, notes, spent_at")
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveExpense = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      const amount = Number(expAmount);
      if (!amount || amount <= 0) throw new Error("أدخل مبلغ المصروف");
      const row = {
        teacher_id: auth.user.id,
        category: expCategory,
        amount,
        month: expMonth,
        notes: expCategory === "other" ? expNotes.trim().slice(0, 500) : "",
      };
      const { error } = expEditId
        ? await supabase.from("expenses").update(row).eq("id", expEditId)
        : await supabase.from("expenses").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(expEditId ? "تم تعديل المصروف" : "تم تسجيل المصروف");
      setExpOpen(false);
      setExpEditId(null);
      setExpAmount("");
      setExpNotes("");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function editExpense(id: string) {
    const e = (expenses.data ?? []).find((x) => x.id === id);
    if (!e) return;
    setExpEditId(id);
    setExpCategory(e.category as ExpenseCategory);
    setExpAmount(String(Number(e.amount)));
    setExpMonth(e.month);
    setExpNotes(e.notes ?? "");
    setExpOpen(true);
  }

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const inMonth = <T extends { month: string }>(rows: T[]) =>
    filterMonth ? rows.filter((r) => r.month === filterMonth) : rows;
  const monthRevenue = inMonth(payments.data ?? []).reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const monthExpenses = inMonth(expenses.data ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = monthRevenue - monthExpenses;
  const byCategory = (Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((c) => ({
    c,
    total: inMonth(expenses.data ?? []).filter((e) => e.category === c).reduce((s, e) => s + Number(e.amount), 0),
  }));

  const savePayment = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      const ids = editId ? (studentId ? [studentId] : []) : selectedIds;
      if (ids.length === 0) throw new Error("اختر طالبًا واحدًا على الأقل");
      const base = {
        teacher_id: auth.user.id,
        month,
        amount_due: Number(amountDue) || 0,
        amount_paid: Number(amountPaid) || 0,
        paid_at: Number(amountPaid) > 0 ? new Date().toISOString().slice(0, 10) : null,
      };
      const { error } = editId
        ? await supabase.from("payments").update({ ...base, student_id: ids[0]! }).eq("id", editId)
        : await supabase.from("payments").insert(ids.map((id) => ({ ...base, student_id: id })));
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(editId ? "تم تعديل الدفعة" : `تم تسجيل ${count} دفعة`);
      setOpen(false);
      setEditId(null);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["payments-list"] });
      queryClient.invalidateQueries({ queryKey: ["payments", currentMonth()] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleStudent(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (selectedIds.length === 0) {
      const student = students.data?.find((s) => s.id === id);
      const group = groups.data?.find((g) => g.id === student?.group_id);
      if (group) {
        setAmountDue(String(Number(group.fee)));
        setAmountPaid(String(Number(group.fee)));
      }
    }
  }

  function selectGroup(groupId: string) {
    if (!groupId) return;
    const ids = (students.data ?? []).filter((s) => s.group_id === groupId).map((s) => s.id);
    if (ids.length === 0) {
      toast.error("لا يوجد طلاب في هذه المجموعة");
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    const group = groups.data?.find((g) => g.id === groupId);
    if (group) {
      setAmountDue(String(Number(group.fee)));
      setAmountPaid(String(Number(group.fee)));
    }
  }

  function editPayment(id: string) {
    const p = (payments.data ?? []).find((x) => x.id === id);
    if (!p) return;
    setEditId(id);
    setStudentId(p.student_id);
    setMonth(p.month);
    setAmountDue(String(Number(p.amount_due)));
    setAmountPaid(String(Number(p.amount_paid)));
    setOpen(true);
  }

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الدفعة");
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
    if (group) {
      setAmountDue(String(Number(group.fee)));
      setAmountPaid(String(Number(group.fee)));
    }
  }

  return (
    <AppShell title="المالية" subtitle="المدفوعات والمتأخرات">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="إجمالي المحصّل" value={`${formatMoney(totalPaid)} ج.م`} tone="success" />
        <StatCard label="إجمالي المتأخرات" value={`${formatMoney(totalDue)} ج.م`} tone="destructive" />
      </section>

      <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">صافي الدخل</h2>
          <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-40" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">الإيرادات</p><p className="font-semibold tabular-nums text-primary">{formatMoney(monthRevenue)}</p></div>
          <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">المصروفات</p><p className="font-semibold tabular-nums text-destructive">{formatMoney(monthExpenses)}</p></div>
          <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">الصافي</p><p className={`font-semibold tabular-nums ${netIncome < 0 ? "text-destructive" : "text-primary"}`}>{formatMoney(netIncome)}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {byCategory.map(({ c, total }) => (
            <div key={c} className="flex justify-between rounded-md border border-border px-3 py-2"><span className="text-muted-foreground">{EXPENSE_LABEL[c]}</span><span className="tabular-nums">{formatMoney(total)}</span></div>
          ))}
        </div>
      </section>

      <SectionTitle
        title="المصروفات"
        aside={
          <Dialog
            open={expOpen}
            onOpenChange={(o) => {
              setExpOpen(o);
              if (!o) setExpEditId(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">إضافة مصروف</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">{expEditId ? "تعديل المصروف" : "مصروف جديد"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>البند</Label>
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                    {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((c) => (
                      <option key={c} value={c}>{EXPENSE_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
                {expCategory === "other" ? (
                  <div className="space-y-2">
                    <Label>ملاحظات (اختياري)</Label>
                    <Textarea value={expNotes} onChange={(e) => setExpNotes(e.target.value)} maxLength={500} placeholder="اكتب تفاصيل المصروف" />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المبلغ</Label>
                    <Input type="number" min={0} value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>الشهر</Label>
                    <Input type="month" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" disabled={saveExpense.isPending} onClick={() => saveExpense.mutate()}>{expEditId ? "حفظ التعديل" : "حفظ المصروف"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {inMonth(expenses.data ?? []).length === 0 ? (
        <EmptyState text="لا توجد مصروفات في هذا الشهر." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
          {inMonth(expenses.data ?? []).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{EXPENSE_LABEL[e.category as ExpenseCategory] ?? e.category}</p>
                {e.notes ? <p className="text-xs text-muted-foreground">{e.notes}</p> : null}
                <p className="text-xs text-muted-foreground">{e.month}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums text-destructive">{formatMoney(Number(e.amount))}</span>
                <Button size="sm" variant="ghost" onClick={() => editExpense(e.id)}>تعديل</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteExpense.mutate(e.id)}>حذف</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle
        title="سجل الدفعات"
        aside={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) {
                setEditId(null);
                setSelectedIds([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">تسجيل دفعة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-right">{editId ? "تعديل الدفعة" : "دفعة جديدة"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {editId ? (
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
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>تحديد مجموعة كاملة</Label>
                      <select
                        value=""
                        onChange={(e) => selectGroup(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      >
                        <option value="">اختر مجموعة لإضافة كل طلابها</option>
                        {(groups.data ?? []).map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>الطلاب ({selectedIds.length} محدد)</Label>
                        {selectedIds.length > 0 ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>إلغاء التحديد</Button>
                        ) : null}
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                        {(students.data ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">لا يوجد طلاب</p>
                        ) : (
                          (students.data ?? []).map((s) => (
                            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(s.id)}
                                onChange={() => toggleStudent(s.id)}
                              />
                              {s.full_name}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
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
                  {editId ? "حفظ التعديل" : "حفظ الدفعة"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {(payments.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا توجد دفعات مسجلة بعد." />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
          <table className="w-full min-w-[560px] text-right text-sm">
            <thead className="border-b border-border bg-secondary/60">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">الطالب</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">الشهر</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">المستحق</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">المدفوع</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">المتبقي</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(payments.data ?? []).map((payment) => {
                const rest = Math.max(Number(payment.amount_due) - Number(payment.amount_paid), 0);
                return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 font-medium">{nameOf(payment.student_id)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{payment.month}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(Number(payment.amount_due))}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(Number(payment.amount_paid))}</td>
                    <td
                      className={`px-4 py-3 font-semibold tabular-nums ${
                        rest > 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {formatMoney(rest)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => editPayment(payment.id)}>تعديل</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={deletePayment.isPending}
                          onClick={() => {
                            if (confirm("هل تريد حذف هذه الدفعة؟")) deletePayment.mutate(payment.id);
                          }}
                        >
                          حذف
                        </Button>
                      </div>
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
