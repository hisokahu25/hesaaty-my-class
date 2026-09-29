import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
