import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth";
import { deviceId } from "@/server/request";
import { groupState, type GroupState } from "@/server/group-carts";
import { JoinGroup } from "@/components/customer/join-group";
import { PageHeader } from "@/components/customer/page-header";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

async function load(code: string): Promise<GroupState | null> {
  const [device, user] = await Promise.all([deviceId(), getCurrentUser()]);
  return groupState(code, { device: device ?? "", userId: user?.id ?? null }).catch(() => null);
}

// What WhatsApp shows when the link is shared: whose order it is and from where.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getT();
  const s = await load((await params).code);
  if (!s) return { title: t("Group order"), robots: { index: false } };
  const title = t("Join {host}'s order from {restaurant}", { host: s.hostName, restaurant: s.restaurant.name });
  return { title, description: t("Add your meal on numnum: one order, cash on delivery."), robots: { index: false }, openGraph: { title, siteName: "numnum", images: s.restaurant.logoUrl ? [{ url: s.restaurant.logoUrl }] : undefined } };
}

/** The link friends get on WhatsApp: join with your name, then add your meal from the menu. */
export default async function GroupJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, user] = await Promise.all([params, getCurrentUser()]);
  const s = await load(code);
  return (
    <main className="pb-nav">
      <PageHeader title="Group order" />
      <div className="container-app pt-4">
        <JoinGroup code={code} initial={s} accountName={user?.name ?? null} />
      </div>
    </main>
  );
}
