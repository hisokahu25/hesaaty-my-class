import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "teacher" | "parent" | "student";
export type AttendanceStatus = "present" | "absent" | "late";

export type Group = {
  id: string;
  teacher_id: string;
  name: string;
  grade: string;
  subject: string;
  days: string[];
  start_time: string;
  location: string;
  fee: number;
};

export type Student = {
  id: string;
  teacher_id: string;
  group_id: string | null;
  parent_user_id: string | null;
  full_name: string;
  grade: string;
  school: string;
  parent_phone: string;
  address: string;
  notes: string;
};

export type Payment = {
  id: string;
  student_id: string;
  month: string;
  amount_due: number;
  amount_paid: number;
  paid_at: string | null;
};

export type Exam = {
  id: string;
  group_id: string | null;
  title: string;
  max_score: number;
  exam_date: string;
};

export const WEEK_DAYS = [
  "السبت",
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function todayName() {
  return WEEK_DAYS[(new Date().getDay() + 1) % 7]!;
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(value);
}

export function formatDateAr(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join(" ");
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Creates the profile + role rows for a freshly confirmed account. */
export async function ensureAccountSetup() {
  const user = await getSessionUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as { full_name?: string; role?: AppRole };
  const role: AppRole = meta.role === "parent" ? "parent" : "teacher";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      full_name: meta.full_name ?? user.email ?? "",
    });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (!roles || roles.length === 0) {
    await supabase.from("user_roles").insert({ user_id: user.id, role });
  }

  const finalRoles = (roles ?? []).map((r) => r.role as AppRole);
  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || meta.full_name || user.email || "",
    role: (finalRoles[0] ?? role) as AppRole,
  };
}

export async function fetchGroups() {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("start_time");
  if (error) throw error;
  return (data ?? []) as Group[];
}

export async function fetchStudents() {
  const { data, error } = await supabase
    .from("students")
    .select("*")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as Student[];
}
