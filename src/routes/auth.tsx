import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureAccountSetup } from "@/lib/db";
import { fetchMyRole, homeForRole } from "@/lib/roles";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | حصتي" },
      {
        name: "description",
        content: "سجّل دخولك إلى حصتي لإدارة مجموعاتك وطلابك وحضورهم ومدفوعاتهم.",
      },
      { property: "og:title", content: "تسجيل الدخول | حصتي" },
      {
        property: "og:description",
        content: "سجّل دخولك إلى حصتي لإدارة مجموعاتك وطلابك وحضورهم ومدفوعاتهم.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"teacher" | "parent">("teacher");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function goHome() {
    await ensureAccountSetup();
    const userRole = await fetchMyRole();
    navigate({ to: homeForRole(userRole ?? "teacher"), replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goHome();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error("أدخل بريدًا صحيحًا وكلمة مرور من ٦ أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), role },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("تم إنشاء الحساب، راجع بريدك لتأكيد التسجيل");
          setMode("signin");
        } else {
          await goHome();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        await goHome();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إتمام العملية");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("تعذّر تسجيل الدخول عبر جوجل");
      return;
    }
    if (result.redirected) return;
    await goHome();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary">
            <span className="text-2xl font-semibold text-primary-foreground">ح</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">حصتي</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              إدارة المدرسين ومراكز الدروس الخصوصية
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-card p-5 shadow-sm ring-1 ring-border">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "دخول" : "حساب جديد"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم بالكامل</Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={100}
                    placeholder="أ/ محمد علي"
                  />
                </div>
                <div className="space-y-2">
                  <Label>نوع الحساب</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["teacher", "parent"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`rounded-lg py-2 text-sm font-medium ring-1 transition-colors ${
                          role === r
                            ? "bg-primary text-primary-foreground ring-primary"
                            : "bg-card text-muted-foreground ring-border"
                        }`}
                      >
                        {r === "teacher" ? "مدرس / مركز" : "ولي أمر"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "جارٍ..." : mode === "signin" ? "تسجيل الدخول" : "إنشاء الحساب"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            أو
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            المتابعة عبر جوجل
          </Button>
        </div>
      </div>
    </div>
  );
}
