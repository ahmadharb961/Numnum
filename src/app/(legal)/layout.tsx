import Link from "next/link";
import { Logo } from "@/components/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex items-center" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <Link href="/" className="text-brand-600" aria-label="numnum home">
          <Logo className="h-7" />
        </Link>
      </header>
      <main className="container-app pb-16">
        <article className="card p-6">{children}</article>
      </main>
    </div>
  );
}
