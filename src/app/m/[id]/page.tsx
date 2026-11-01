import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { canSeeBroadcast, messagePath } from "@/server/broadcast";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { getLocale, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Message", robots: { index: false } };

/** A message sent by numnum (admin push notification): opened by tapping the notification. */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [b, user, t, lang] = await Promise.all([prisma.pushBroadcast.findUnique({ where: { id } }), getCurrentUser(), getT(), getLocale()]);
  if (!b) notFound();
  const staff = user ? await prisma.restaurantStaff.findMany({ where: { userId: user.id }, select: { restaurantId: true } }) : [];
  if (!(await canSeeBroadcast(b, id, user))) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
        <div>
          <div className="text-5xl">🔒</div>
          <h1 className="mt-3 text-xl font-black">{t("This message isn't for this account")}</h1>
          <p className="mt-1 text-ink-muted">{t("Log in with the account that received it.")}</p>
          <Link href={`/login?next=${messagePath(id)}`} className={buttonClass("primary", "lg") + " mt-5"}>
            {t("Log in")}
          </Link>
        </div>
      </main>
    );
  }
  // Opening it marks it read in the restaurant's notifications.
  if (staff.length) await prisma.notification.updateMany({ where: { link: messagePath(id), restaurantId: { in: staff.map((s) => s.restaurantId) }, readAt: null }, data: { readAt: new Date() } });
  const back = staff.length ? "/dashboard/notifications" : "/";
  const external = !!b.link && /^https:\/\//.test(b.link);
  return (
    <main className="min-h-dvh bg-cream pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-white/95 px-4 backdrop-blur" style={{ paddingTop: "var(--safe-top)", height: "calc(3.5rem + var(--safe-top))" }}>
        <Link href={back} className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5" aria-label={t("Back")}>
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <span className="font-bold">{t("Message from numnum")}</span>
      </header>
      <article className="mx-auto max-w-xl px-4 pt-5" data-testid="broadcast-message">
        {b.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.imageUrl} alt="" className="w-full rounded-3xl bg-black/5 object-contain shadow-sm" />
        )}
        {b.title && <h1 className="mt-5 text-2xl font-black leading-tight tracking-tight">{b.title}</h1>}
        {b.body && <p className="mt-2 whitespace-pre-line text-[17px] leading-relaxed text-ink-soft">{b.body}</p>}
        <p className="mt-3 text-sm text-ink-muted">{formatDateTime(b.createdAt, lang)}</p>
        {b.link &&
          (external ? (
            <a href={b.link} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "lg") + " mt-6 w-full"}>
              {t("Open link")} <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <Link href={b.link} className={buttonClass("primary", "lg") + " mt-6 w-full"}>
              {t("Open")}
            </Link>
          ))}
        <Link href={back} className={buttonClass("outline", "lg") + " mt-3 w-full"}>
          {staff.length ? t("All notifications") : t("Back to numnum")}
        </Link>
      </article>
    </main>
  );
}
