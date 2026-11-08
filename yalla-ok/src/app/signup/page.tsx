import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { GOOGLE_AUTH_ENABLED } from "@/lib/env";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/post");
  const { user } = await getSession();
  if (user) redirect(next);
  return (
    <AuthShell title="Create your account" sub="Browsing is free for everyone. An account lets you post tasks.">
      <SignUpForm next={next} google={GOOGLE_AUTH_ENABLED} />
    </AuthShell>
  );
}
