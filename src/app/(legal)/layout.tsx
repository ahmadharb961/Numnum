import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { BackButton } from "@/components/back-button";
import { getT } from "@/i18n/server";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="min-h-dvh bg-cream">
      {/* Back to where they came from (Account, sign-up…), or Account when opened directly: the app has no browser back button. */}
      <header className="container-app grid grid-cols-[1fr_auto_1fr] items-center" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton fallback="/account" />
        <Link href="/" className="justify-self-center text-brand-600" aria-label={t("numnum home")}>
          <Logo className="h-10" />
        </Link>
        <span />
      </header>
      <main className="container-app pb-16">
        <article className="card p-6">{children}</article>
      </main>
    </div>
  );
}
