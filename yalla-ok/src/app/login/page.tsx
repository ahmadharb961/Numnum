import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { GOOGLE_AUTH_ENABLED } from "@/lib/env";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const { user } = await getSession();
  if (user) redirect(next);
  return (
    <AuthShell title="Welcome back" sub="Sign in to post and manage your tasks.">
      {sp.error && (
        <Notice tone="error" className="mb-5">
          {sp.error === "google" ? "Google sign-in isn’t available right now." : "That link has expired. Please try again."}
        </Notice>
      )}
      <SignInForm next={next} google={GOOGLE_AUTH_ENABLED} />
    </AuthShell>
  );
}
