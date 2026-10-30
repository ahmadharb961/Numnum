import Link from "next/link";
import { BackButton } from "@/components/back-button";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex items-center gap-1" style={{ paddingTop: "var(--safe-top)", height: "calc(4rem + var(--safe-top))" }}>
        <BackButton />
        <Link href="/" className="text-2xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="container-app pb-12">{children}</main>
    </div>
  );
}
