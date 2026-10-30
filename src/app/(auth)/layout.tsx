import Link from "next/link";
import { BackButton } from "@/components/back-button";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fdf8f2]">
      <header className="mx-auto grid max-w-6xl grid-cols-[40px_1fr_40px] items-center px-4 lg:px-8" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton />
        <Link href="/" className="justify-self-center text-3xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-12 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-16 lg:pt-4">
        {/* Desktop: illustration beside the form (phones show it inside the login page). */}
        <div className="hidden lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/illustrations/login-hero.webp" alt="A chef cooking and a customer enjoying her meal" className="w-full rounded-[2rem]" />
        </div>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
