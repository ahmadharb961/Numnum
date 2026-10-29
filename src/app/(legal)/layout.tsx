import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex h-16 items-center" style={{ paddingTop: "var(--safe-top)" }}>
        <Link href="/" className="text-2xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="container-app pb-16">
        <article className="card p-6">{children}</article>
      </main>
    </div>
  );
}
