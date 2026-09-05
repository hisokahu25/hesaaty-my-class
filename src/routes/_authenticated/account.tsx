import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, useMyRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "حسابي | حصتي" },
      {
        name: "description",
        content: "إدارة بيانات حسابك في حصتي وتغيير كلمة المرور بأمان.",
      },
      { property: "og:title", content: "حسابي | حصتي" },
      { property: "og:description", content: "بيانات الحساب وتغيير كلمة المرور." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const role = useMyRole();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      return {
        email: user.email ?? "",
        fullName: data?.full_name ?? "",
        phone: data?.phone ?? "",
      };
    },
  });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("تم تحديث كلمة المرور");
  }

  return (
    <AppShell title="حسابي" subtitle="البيانات والأمان">
      <section className="space-y-3">
        <SectionTitle title="بيانات الحساب" />
        <div className="space-y-2 rounded-xl bg-card p-4 text-sm shadow-sm ring-1 ring-border">
          <Row label="الاسم" value={profile.data?.fullName || "—"} />
          <Row label="البريد" value={profile.data?.email || "—"} />
          <Row label="الهاتف" value={profile.data?.phone || "—"} />
          <Row
            label="نوع الحساب"
            value={role.data ? ROLE_LABEL[role.data] : "—"}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="تغيير كلمة المرور" />
        <form
          onSubmit={changePassword}
          className="space-y-4 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border"
        >
          <div className="space-y-2">
            <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
            <Input
              id="new-password"
              type="password"
              dir="ltr"
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
            <Input
              id="confirm-password"
              type="password"
              dir="ltr"
              maxLength={72}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
          </Button>
        </form>
      </section>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
