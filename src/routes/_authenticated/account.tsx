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
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState("");

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

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.error("أدخل الاسم بالكامل");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setSaving(false);
      toast.error("لم يتم التعرف على المستخدم");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.updateUser({ data: { full_name: trimmed } });
    queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    setEditingName(false);
    toast.success("تم تحديث الاسم");
  }

  function startEditingName() {
    setFullName(profile.data?.fullName ?? "");
    setEditingName(true);
  }

  return (
    <AppShell title="حسابي" subtitle="البيانات والأمان">
      <section className="space-y-3">
        <SectionTitle title="بيانات الحساب" />
        <div className="space-y-2 rounded-xl bg-card p-4 text-sm shadow-sm ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">الاسم</span>
            {editingName ? (
              <form onSubmit={saveName} className="flex flex-1 items-center gap-2">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                  className="h-8 flex-1"
                />
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "جارٍ..." : "حفظ"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingName(false)}
                  disabled={saving}
                >
                  إلغاء
                </Button>
              </form>
            ) : (
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="font-medium">{profile.data?.fullName || "—"}</span>
                <button
                  type="button"
                  onClick={startEditingName}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  تعديل
                </button>
              </div>
            )}
          </div>
          <Row label="البريد" value={profile.data?.email || "—"} />
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
