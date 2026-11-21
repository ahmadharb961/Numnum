import { nextHandleChange } from "@/server/creators";
import { formatDate } from "@/lib/utils";
import { getLocale } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/customer/page-header";
import { CreatorProfileForm } from "@/components/creator/profile-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit profile"), robots: { index: false } };
}

export default async function CreatorProfileEditPage() {
  const me = await requireUser("/creator/profile");
  const c = await prisma.creator.findUnique({ where: { userId: me.id } });
  if (c?.status !== "APPROVED") redirect("/creator");
  const [lang, next] = [await getLocale(), nextHandleChange(c)];
  // Shown as a date in the reader's language: "18 Feb 2027".
  const lockedUntil = next ? formatDate(next, { dateStyle: "medium" }, lang) : null;
  return (
    <div className="pb-nav">
      <PageHeader title="Edit profile" />
      <div className="container-app max-w-xl py-5">
        <div className="card p-5">
          <CreatorProfileForm mode="edit" initial={{ handle: c.handle, displayName: c.displayName, bio: c.bio ?? "", instagram: c.instagram ?? "", tiktok: c.tiktok ?? "", audienceSize: c.audienceSize != null ? String(c.audienceSize) : "", area: c.area ?? "", avatarUrl: c.avatarUrl, bannerUrl: c.bannerUrl }} handleLockedUntil={lockedUntil} />
        </div>
      </div>
    </div>
  );
}
