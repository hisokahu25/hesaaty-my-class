import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle, StatCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import type { ApprovalStatus } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "إدارة الاشتراكات | حصتي" },
      { name: "description", content: "متابعة طلبات الاشتراك الجديدة في حصتي والموافقة عليها أو رفضها." },
      { property: "og:title", content: "إدارة الاشتراكات | حصتي" },
      { property: "og:description", content: "لوحة المدير لمتابعة الاشتراكات." },
    ],
  }),
  component: AdminPage,
});

type Row = { user_id: string; email: string; full_name: string; status: ApprovalStatus; created_at: string };
const LABEL: Record<ApprovalStatus, string> = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };

function AdminPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["account-approvals"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("account_approvals" as never) as any)
        .select("user_id, email, full_name, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApprovalStatus }) => {
      const { error } = await (supabase.from("account_approvals" as never) as any)
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("user_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة الاشتراك");
      qc.invalidateQueries({ queryKey: ["account-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_user" as never, { _user_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["account-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [busy, setBusy] = useState(false);

  async function exportData(r: Row) {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_export_user_data" as never, { _user_id: r.user_id } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hesaty-${(r.email || r.user_id).replace(/[^a-z0-9@._-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("تم تصدير البيانات");
  }

  function importData(r: Row) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); } catch { { toast.error("الملف غير صالح"); return; } }
      if (!confirm(`استيراد البيانات إلى حساب ${r.email}؟ البيانات الموجودة لن تُحذف.`)) return;
      setBusy(true);
      const { error } = await supabase.rpc("admin_import_user_data" as never, { _user_id: r.user_id, _data: parsed } as never);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("تم استيراد البيانات");
    };
    input.click();
  }

  async function wipeData(r: Row) {
    if (!confirm(`مسح كل بيانات ${r.email} (الطلاب والمجموعات والدفعات والاختبارات...) مع إبقاء الحساب؟ ننصح بتصدير البيانات أولًا. لا يمكن التراجع.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_wipe_user_data" as never, { _user_id: r.user_id } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم مسح البيانات");
  }

  const editCreds = useMutation({
    mutationFn: async ({ id, email, password }: { id: string; email: string; password: string }) => {
      const { error } = await supabase.rpc("admin_update_user_credentials" as never, {
        _user_id: id, _email: email || null, _password: password || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث بيانات الدخول");
      qc.invalidateQueries({ queryKey: ["account-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = list.data ?? [];
  const count = (s: ApprovalStatus) => rows.filter((r) => r.status === s).length;

  return (
    <AppShell title="الاشتراكات" subtitle="لوحة مدير الموقع">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="قيد المراجعة" value={String(count("pending"))} />
        <StatCard label="مقبول" value={String(count("approved"))} />
        <StatCard label="مرفوض" value={String(count("rejected"))} />
      </div>
      <SectionTitle title="الحسابات المسجلة" />
      {rows.length === 0 ? (
        <EmptyState text="لا توجد اشتراكات بعد." />
      ) : (
        <div className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
          {rows.map((r) => (
            <div key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{r.full_name || "بدون اسم"}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{r.email}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("ar-EG")} • {LABEL[r.status]}
                </p>
              </div>
              <div className="flex gap-2">
                {r.status !== "approved" ? (
                  <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.user_id, status: "approved" })}>قبول</Button>
                ) : null}
                {r.status !== "rejected" ? (
                  <Button size="sm" variant="outline" className="text-destructive" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.user_id, status: "rejected" })}>
                    {r.status === "approved" ? "إيقاف" : "رفض"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={editCreds.isPending}
                  onClick={() => {
                    const email = prompt(`البريد الجديد (اتركه فارغًا لعدم التغيير):`, r.email);
                    if (email === null) return;
                    const password = prompt("كلمة المرور الجديدة (6 أحرف على الأقل، اتركها فارغة لعدم التغيير):", "");
                    if (password === null) return;
                    const e = email.trim() === r.email ? "" : email.trim();
                    if (!e && !password) return;
                    editCreds.mutate({ id: r.user_id, email: e, password });
                  }}
                >
                  تعديل البريد/كلمة المرور
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => exportData(r)}>
                  تصدير البيانات
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => importData(r)}>
                  استيراد البيانات
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => wipeData(r)}
                >
                  مسح البيانات
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={removeUser.isPending}
                  onClick={() => {
                    if (confirm(`حذف الحساب ${r.email} نهائيًا مع كل بياناته؟ لا يمكن التراجع.`)) removeUser.mutate(r.user_id);
                  }}
                >
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
