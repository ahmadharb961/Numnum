import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="container-app flex h-16 items-center" style={{ paddingTop: "var(--safe-top)" }}>
        <Link href="/" className="text-2xl font-black tracking-tight text-brand-600">
          numnum
        </Link>
      </header>
      <main className="container-app pb-12">{children}</main>
    </div>
  );
}
