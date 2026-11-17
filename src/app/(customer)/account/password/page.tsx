import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/customer/page-header";
import { ChangePasswordForm } from "@/components/password-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Change password"), robots: { index: false } };
}

export default async function ChangePasswordPage() {
  await requireUser("/account/password");
  return (
    <div className="pb-nav">
      <PageHeader title="Change password" />
      <div className="container-app max-w-md py-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
