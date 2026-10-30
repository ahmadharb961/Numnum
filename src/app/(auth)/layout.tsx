import Link from "next/link";
import { BackButton } from "@/components/back-button";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fdf8f2]">
      <header className="mx-auto grid max-w-md grid-cols-[40px_1fr_40px] items-center px-4" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton />
        <Link href="/" className="justify-self-center text-3xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-12 lg:pt-8">{children}</main>
    </div>
  );
}
