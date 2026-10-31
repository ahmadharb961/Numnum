import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="min-h-dvh bg-[#fdf8f2]">
      <header className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center px-4" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton />
        <Link href="/" className="justify-self-center text-brand-600" aria-label={t("numnum home")}>
          <Logo className="h-10" />
        </Link>
        <LanguageSwitcher compact className="justify-self-end" />
      </header>
      <main className="mx-auto max-w-md px-4 pb-12 lg:pt-8">{children}</main>
    </div>
  );
}
