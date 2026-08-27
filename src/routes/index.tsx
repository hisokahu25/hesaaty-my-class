import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حصتي — إدارة المدرسين ومراكز الدروس الخصوصية" },
      {
        name: "description",
        content:
          "حصتي تطبيق عربي لإدارة الطلاب والمجموعات وجدول الحصص والحضور والدرجات والمصروفات والمتأخرات للمدرس الفردي والمركز التعليمي.",
      },
      { property: "og:title", content: "حصتي — إدارة المدرسين ومراكز الدروس" },
      {
        property: "og:description",
        content: "دفترك الرقمي: طلاب، مجموعات، حضور، درجات، ومتابعة مالية في مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { title: "الطلاب والمجموعات", body: "سجل الطلاب ووزعهم على مجموعات بصفوف ومواد وأوقات محددة." },
  { title: "جدول الحصص", body: "حدد أيام وساعة كل مجموعة وشاهد حصص اليوم فور فتح التطبيق." },
  { title: "الحضور السريع", body: "حاضر / غائب / متأخر بضغطة واحدة مع نسبة حضور لكل طالب." },
  { title: "الدرجات", body: "أنشئ اختبارات وسجل درجات الطلاب وتابع مستواهم." },
  { title: "المالية", body: "اشتراكات شهرية، مدفوع ومتبقي، وتنبيه بالمتأخرات." },
  { title: "لوحة تحكم", body: "أرقامك اليومية: طلاب، حضور، إيرادات، ومتأخرات." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <span className="text-lg font-bold tracking-tight">حصتي</span>
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            ابدأ الآن
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          دفتر المدرس، لكن بشكل منظم
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          إدارة كاملة للطلاب والمجموعات والحضور والدرجات والمصروفات — مناسب للمدرس الفردي
          وللمركز التعليمي.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            إنشاء حساب مجاني
          </Link>
        </div>

        <section className="mt-12 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-xl bg-card p-5 ring-1 ring-border">
              <h2 className="text-base font-semibold">{feature.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        حصتي — لإدارة الدروس الخصوصية
      </footer>
    </div>
  );
}
