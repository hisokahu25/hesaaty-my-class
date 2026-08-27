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
import { fetchGroups, fetchStudents, formatMoney, WEEK_DAYS } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/groups")({
  head: () => ({
    meta: [
      { title: "الجدول والمجموعات | حصتي" },
      {
        name: "description",
        content: "أنشئ المجموعات وحدد الصف والمادة والأيام والساعة ومكان الحصة وقيمة الاشتراك.",
      },
      { property: "og:title", content: "الجدول والمجموعات | حصتي" },
      { property: "og:description", content: "جدول الحصص وإدارة المجموعات في حصتي." },
    ],
  }),
  component: GroupsPage,
});

const EMPTY = {
  name: "",
  grade: "",
  subject: "",
  location: "",
  start_time: "16:00",
  fee: "0",
  days: [] as string[],
};

function GroupsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });

  const addGroup = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!form.name.trim()) throw new Error("اسم المجموعة مطلوب");
      const { error } = await supabase.from("groups").insert({
        teacher_id: auth.user.id,
        name: form.name.trim().slice(0, 100),
        grade: form.grade.trim().slice(0, 60),
        subject: form.subject.trim().slice(0, 60),
        location: form.location.trim().slice(0, 120),
        start_time: form.start_time,
        fee: Number(form.fee) || 0,
        days: form.days,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة المجموعة");
      setForm(EMPTY);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const countIn = (groupId: string) =>
    (students.data ?? []).filter((s) => s.group_id === groupId).length;

  return (
    <AppShell title="الجدول" subtitle="المجموعات ومواعيد الحصص">
      <SectionTitle
        title={`${groups.data?.length ?? 0} مجموعة`}
        aside={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">إضافة مجموعة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-right">مجموعة جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Row label="اسم المجموعة" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <Row label="الصف" value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
                <Row label="المادة" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
                <Row label="مكان الحصة" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>الساعة</Label>
                    <Input
                      type="time"
                      value={form.start_time}
                      onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>قيمة الاشتراك</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.fee}
                      onChange={(e) => setForm({ ...form, fee: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الأيام</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((day) => {
                      const active = form.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              days: active
                                ? form.days.filter((d) => d !== day)
                                : [...form.days, day],
                            })
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                            active
                              ? "bg-primary text-primary-foreground ring-primary"
                              : "bg-card text-muted-foreground ring-border"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={addGroup.isPending}
                  onClick={() => addGroup.mutate()}
                >
                  حفظ المجموعة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {(groups.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا توجد مجموعات بعد. أنشئ أول مجموعة لتبدأ جدولة الحصص." />
      ) : (
        <div className="space-y-3">
          {(groups.data ?? []).map((group) => (
            <div key={group.id} className="rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-start justify-between">
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
                    {group.days.join(" • ") || "بدون أيام"} — {group.start_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-muted-foreground">{group.location || "مكان غير محدد"}</p>
                </div>
                <div className="text-left">
                  <span className="text-lg font-semibold text-primary">
                    {formatMoney(Number(group.fee))} ج.م
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {formatMoney(countIn(group.id))} طالب
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} maxLength={120} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
