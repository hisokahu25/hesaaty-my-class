import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, SectionTitle } from "@/components/AppShell";
import { formatDateAr } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "التنبيهات | حصتي" },
      {
        name: "description",
        content: "تنبيهات المتأخرات والغياب والاختبارات القادمة في مكان واحد.",
      },
      { property: "og:title", content: "التنبيهات | حصتي" },
      { property: "og:description", content: "كل تنبيهات حصتي في مكان واحد." },
    ],
  }),
  component: NotificationsPage,
});

type Notification = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  is_read: boolean;
};

function NotificationsPage() {
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, is_read")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  return (
    <AppShell title="التنبيهات" subtitle="آخر التحديثات">
      <SectionTitle title={`${notifications.data?.length ?? 0} تنبيه`} />
      {(notifications.data?.length ?? 0) === 0 ? (
        <EmptyState text="لا توجد تنبيهات حاليًا." />
      ) : (
        <div className="space-y-2">
          {(notifications.data ?? []).map((item) => (
            <div
              key={item.id}
              className={`rounded-xl p-4 ring-1 ${
                item.is_read ? "bg-card ring-border" : "bg-primary/5 ring-primary/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold">{item.title}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDateAr(item.created_at.slice(0, 10))}
                </span>
              </div>
              {item.body ? (
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
