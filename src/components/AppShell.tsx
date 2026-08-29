import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, CreditCard, Home, LogOut, CalendarDays, Users, User } from "lucide-react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canAccess, homeForRole, useMyRole } from "@/lib/roles";

const NAV = [
  { to: "/dashboard", label: "الرئيسية", icon: Home },
  { to: "/students", label: "الطلاب", icon: Users },
  { to: "/groups", label: "الجدول", icon: CalendarDays },
  { to: "/grades", label: "الدرجات", icon: Bell },
  { to: "/payments", label: "المالية", icon: CreditCard },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useMyRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = NAV.filter((item) => (role.data ? canAccess(role.data, item.to) : false));
  const allowed = role.data ? canAccess(role.data, pathname) : null;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">

      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <span className="text-lg font-semibold text-primary-foreground">ح</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">{title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/notifications"
            className="flex size-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border"
            aria-label="الإشعارات"
          >
            <Bell className="size-4 text-muted-foreground" />
          </Link>
          <button
            onClick={signOut}
            className="flex size-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="size-4 text-muted-foreground" />
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 text-muted-foreground"
              activeProps={{ className: "flex flex-col items-center gap-1 text-primary" }}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function SectionTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-lg font-semibold text-balance">{title}</h2>
      {aside ? <span className="text-sm font-medium text-primary">{aside}</span> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "muted" | "success" | "accent" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "accent"
        ? "text-accent"
        : tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? <div className={`mt-2 text-[10px] font-medium ${toneClass}`}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">
      {text}
    </div>
  );
}
