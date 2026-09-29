import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/db";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "مدير النظام",
  teacher: "مدرس / مركز",
  parent: "ولي أمر",
  student: "طالب",
};

/** الصفحات المسموح بها لكل نوع مستخدم. */
export const ROLE_ROUTES: Record<AppRole, string[]> = {
  admin: [
    "/admin",
    "/dashboard",
    "/students",
    "/groups",
    "/attendance",
    "/grades",
    "/exams",
    "/payments",
    "/stats",
    "/notifications",
    "/account",
  ],
  teacher: [
    "/dashboard",
    "/students",
    "/groups",
    "/attendance",
    "/grades",
    "/exams",
    "/payments",
    "/stats",
    "/notifications",
    "/account",
  ],
  parent: ["/grades", "/payments", "/attendance", "/stats", "/notifications", "/account"],
  student: ["/grades", "/attendance", "/stats", "/notifications", "/account"],
};

export function homeForRole(role: AppRole): "/dashboard" | "/grades" {
  return role === "admin" || role === "teacher" ? "/dashboard" : "/grades";
}

export function canAccess(role: AppRole, pathname: string) {
  return ROLE_ROUTES[role].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export async function fetchMyApproval(): Promise<ApprovalStatus | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  await supabase.rpc("claim_owner_admin" as never);
  const { data } = await (supabase.from("account_approvals" as never) as any)
    .select("status").eq("user_id", user.id).maybeSingle();
  return ((data as { status?: ApprovalStatus } | null)?.status ?? "pending");
}

export function useMyApproval() {
  return useQuery({ queryKey: ["my-approval"], queryFn: fetchMyApproval, staleTime: 60 * 1000 });
}

export async function fetchMyRole(): Promise<AppRole | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  await supabase.rpc("claim_owner_admin" as never);

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  if (roles.includes("parent")) return "parent";
  if (roles.includes("student")) return "student";

  const meta = (user.user_metadata ?? {}) as { role?: AppRole };
  return meta.role === "parent" ? "parent" : "teacher";
}

export function useMyRole() {
  return useQuery({
    queryKey: ["my-role"],
    queryFn: fetchMyRole,
    staleTime: 5 * 60 * 1000,
  });
}

/** للمدير فقط: خريطة معرف المدرس/المركز -> اسمه (أو بريده). */
export function useOwnerNames() {
  const role = useMyRole();
  const isAdmin = role.data === "admin";
  const q = useQuery({
    queryKey: ["owner-names"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await (supabase.from("account_approvals" as never) as any)
        .select("user_id, email, full_name");
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { user_id: string; email: string; full_name: string }[]) {
        map[r.user_id] = r.full_name || r.email;
      }
      return map;
    },
  });
  return { isAdmin, ownerName: (id: string) => q.data?.[id] ?? "غير معروف" };
}
