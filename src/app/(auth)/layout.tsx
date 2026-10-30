import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fdf8f2]">
      <header className="mx-auto grid max-w-md grid-cols-[40px_1fr_40px] items-center px-4" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton />
        <Link href="/" className="justify-self-center text-brand-600" aria-label="numnum home">
          <Logo className="h-10" />
        </Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-12 lg:pt-8">{children}</main>
    </div>
  );
}
