import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchGroups, fetchStudents, initials, type Student } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "الطلاب | حصتي" },
      {
        name: "description",
        content: "أضف بيانات الطلاب: الصف والمدرسة ورقم ولي الأمر والعنوان والمجموعة والملاحظات.",
      },
      { property: "og:title", content: "الطلاب | حصتي" },
      { property: "og:description", content: "إدارة بيانات الطلاب ومجموعاتهم في حصتي." },
    ],
  }),
  component: StudentsPage,
});

const EMPTY = {
  full_name: "",
  grade: "",
  school: "",
  parent_phone: "",
  address: "",
  notes: "",
  group_id: "",
};

function StudentsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const students = useQuery({ queryKey: ["students"], queryFn: fetchStudents });
  const groups = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });

  function openNew() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(student: Student) {
    setEditingId(student.id);
    setForm({
      full_name: student.full_name,
      grade: student.grade,
      school: student.school,
      parent_phone: student.parent_phone,
      address: student.address,
      notes: student.notes,
      group_id: student.group_id ?? "",
    });
    setOpen(true);
  }

  const saveStudent = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("انتهت الجلسة");
      if (!form.full_name.trim()) throw new Error("اسم الطالب مطلوب");
      const payload = {
        full_name: form.full_name.trim().slice(0, 100),
        grade: form.grade.trim().slice(0, 60),
        school: form.school.trim().slice(0, 100),
        parent_phone: form.parent_phone.trim().slice(0, 20),
        address: form.address.trim().slice(0, 200),
        notes: form.notes.trim().slice(0, 500),
        group_id: form.group_id || null,
      };
      if (editingId) {
        const { error } = await supabase.from("students").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("students")
          .insert({ teacher_id: auth.user.id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تحديث بيانات الطالب" : "تمت إضافة الطالب");
      setForm(EMPTY);
      setEditingId(null);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStudent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الطالب");
      setOpen(false);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groupName = (id: string | null) =>
    groups.data?.find((g) => g.id === id)?.name ?? "بدون مجموعة";

  return (
    <AppShell title="الطلاب" subtitle="بيانات الطلاب والمجموعات">
      <SectionTitle
        title={`${students.data?.length ?? 0} طالب`}
        aside={
          <Button size="sm" onClick={openNew}>
            إضافة طالب
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editingId ? "تعديل بيانات الطالب" : "طالب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="الاسم" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
            <Field label="الصف" value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
            <Field label="المدرسة" value={form.school} onChange={(v) => setForm({ ...form, school: v })} />
            <Field label="رقم ولي الأمر" value={form.parent_phone} onChange={(v) => setForm({ ...form, parent_phone: v })} />
            <Field label="العنوان" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <div className="space-y-2">
              <Label>المجموعة</Label>
              <select
                value={form.group_id}
                onChange={(e) => {
                  const groupId = e.target.value;
                  const group = groups.data?.find((g) => g.id === groupId);
                  setForm({
                    ...form,
                    group_id: groupId,
                    grade: group?.grade ?? form.grade,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">بدون مجموعة</option>
                {(groups.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={form.notes}
                maxLength={500}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <Button
              className="w-full"
              disabled={saveStudent.isPending}
              onClick={() => saveStudent.mutate()}
            >
              {editingId ? "حفظ التعديلات" : "حفظ الطالب"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                className="w-full text-destructive"
                disabled={deleteStudent.isPending}
                onClick={() => {
                  if (window.confirm("سيتم حذف الطالب وكل سجلاته. هل أنت متأكد؟")) {
                    deleteStudent.mutate(editingId);
                  }
                }}
              >
                حذف الطالب
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {(students.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا يوجد طلاب بعد. ابدأ بإضافة أول طالب." />
      ) : (
        <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
          {(students.data ?? []).map((student) => (
            <div key={student.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                  {initials(student.full_name)}
                </div>
                <div>
                  <p className="text-base font-medium">{student.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.grade || "بدون صف"} • {groupName(student.group_id)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {student.parent_phone}
                </span>
                <Button size="sm" variant="outline" onClick={() => openEdit(student)}>
                  تعديل
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Field({
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
      <Input value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
