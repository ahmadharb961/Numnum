import type { Metadata } from "next";
import Link from "next/link";
import { CustomerRegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="text-3xl font-black tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">Order with cash on delivery, save your addresses, track orders and rate what you ate.</p>
      <div className="mt-6">
        <CustomerRegisterForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600">
          Log in
        </Link>
      </p>
    </div>
  );
}
