import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clapperboard, Hourglass, ShoppingBag, Store } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/customer/page-header";
import { CreatorProfileForm } from "@/components/creator/profile-form";
import { Alert } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Become a food creator"), robots: { index: false } };
}

export default async function CreatorApplyPage() {
  const t = await getT();
  const me = await requireUser("/creator/apply");
  const c = await prisma.creator.findUnique({ where: { userId: me.id } });
  if (c?.status === "APPROVED" || c?.status === "SUSPENDED") redirect("/creator");
  const steps = [
    { icon: Clapperboard, text: t("Post food reels and tag the dish you're eating.") },
    { icon: Store, text: t("The restaurant approves the tag.") },
    { icon: ShoppingBag, text: t("People order the dish straight from your reel, and you see the orders you bring.") },
  ];
  return (
    // Room for the bottom bar, so the last button is never hidden behind it.
    <div className="pb-nav">
      <PageHeader title="Become a food creator" />
      <div className="container-app max-w-xl space-y-5 py-5">
        {c?.status === "PENDING" ? (
          <div className="card p-6 text-center" data-testid="creator-pending">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600">
              <Hourglass className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-xl font-black tracking-tight">{t("Your application is being reviewed")}</h2>
            <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("We'll email you and send a notification once it's approved, usually within a day.")}</p>
            <p className="mt-4 text-sm font-semibold" dir="ltr">@{c.handle}</p>
          </div>
        ) : (
          <>
            <div className="card space-y-3 p-5">
              {steps.map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[15px] font-medium">{text}</span>
                </div>
              ))}
            </div>
            {c?.status === "DECLINED" && (
              <Alert tone="amber">
                {t("Your last application wasn't approved.")} {c.decisionNote ? t("Reason: {reason}", { reason: c.decisionNote }) : ""} {t("You can update your details and apply again.")}
              </Alert>
            )}
            <div className="card p-5">
              <CreatorProfileForm
                mode="apply"
                initial={{ handle: c?.handle ?? "", displayName: c?.displayName ?? me.name, bio: c?.bio ?? "", instagram: c?.instagram ?? "", tiktok: c?.tiktok ?? "", audienceSize: c?.audienceSize != null ? String(c.audienceSize) : "", area: c?.area ?? "", avatarUrl: c?.avatarUrl ?? null }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
