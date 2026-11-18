import type { Metadata, Viewport } from "next";
import Link from "@/components/link";
import { Bookmark, LayoutDashboard, MapPin, ShoppingBag, Shield, EyeOff, Headphones, Heart, KeyRound, Clapperboard, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { cn } from "@/lib/utils";
import { AccountForm } from "@/components/customer/account-form";
import { NotifyPrompt } from "@/components/customer/notify-prompt";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatPhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";
import { STATUS_META, ACTIVE_STATUSES } from "@/lib/order-status";
import { KeepLoaded } from "@/components/link-warmer";
import { NotificationsBell } from "@/components/notifications-bell";
import { unreadUserCount } from "@/server/user-notifications";
import { getT } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

// The browser bar matches the orange header.
export const viewport: Viewport = { themeColor: "#f03a08" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Account"), robots: { index: false } };
}

export default async function AccountPage() {
  const t = await getT();
  const user = await requireUser("/account");
  const [active, orderCount, addressCount, staffCount, followingCount, creator, unread, followingCreators] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.customerAddress.count({ where: { userId: user.id } }),
    prisma.restaurantStaff.count({ where: { userId: user.id } }),
    prisma.restaurantFollow.count({ where: { userId: user.id, restaurant: { status: "ACTIVE", blockedBy: { none: { userId: user.id } } } } }),
    prisma.creator.findUnique({ where: { userId: user.id }, select: { status: true } }),
    unreadUserCount(user.id),
    prisma.creatorFollow.count({ where: { userId: user.id, creator: { status: "APPROVED" } } }),
  ]);
  type Tile = { href: string; icon: LucideIcon; label: string; sub: string; tone: string };
  // Food creators: apply, wait for review, then the studio.
  const creatorTile: Tile =
    creator?.status === "APPROVED" || creator?.status === "SUSPENDED"
      ? { href: "/creator", icon: Clapperboard, label: "Creator studio", sub: "Your reels, tags and insights", tone: TONES.orange }
      : creator?.status === "PENDING"
        ? { href: "/creator/apply", icon: Clapperboard, label: "Creator application", sub: "Being reviewed", tone: TONES.orange }
        : { href: "/creator/apply", icon: Clapperboard, label: "Become a food creator", sub: "Post reels, tag dishes, people order from your videos", tone: TONES.orange };
  const tiles: Tile[] = [
    ...(staffCount ? [{ href: "/dashboard", icon: LayoutDashboard, label: "Restaurant dashboard", sub: "Orders, menu, reels, insights", tone: TONES.teal }] : []),
    ...(user.roles.includes("ADMIN") ? [{ href: "/admin", icon: Shield, label: "Admin panel", sub: "Restaurants, payments, settings", tone: TONES.slate }] : []),
    creatorTile,
    { href: "/account/orders", icon: ShoppingBag, label: "My orders", sub: t(orderCount === 1 ? "{n} order" : "{n} orders", { n: orderCount }), tone: TONES.amber },
    { href: "/account/addresses", icon: MapPin, label: "Saved addresses", sub: t("{n} saved", { n: addressCount }), tone: TONES.red },
    { href: "/account/following", icon: Heart, label: "Following", sub: [t(followingCount === 1 ? "{n} restaurant" : "{n} restaurants", { n: followingCount }), followingCreators ? t(followingCreators === 1 ? "{n} creator" : "{n} creators", { n: followingCreators }) : null].filter(Boolean).join(" · "), tone: TONES.pink },
    { href: "/saved", icon: Bookmark, label: "Saved dishes & restaurants", sub: "Reels, dishes, restaurants", tone: TONES.violet },
    { href: "/account/blocked", icon: EyeOff, label: "Blocked", sub: "Restaurants and people you hid", tone: TONES.blue },
    { href: "/account/password", icon: KeyRound, label: "Change password", sub: "Keep your account secure", tone: TONES.green },
    { href: "/support", icon: Headphones, label: "Help & support", sub: "Contact us, terms and privacy", tone: TONES.sky },
  ];
  // Rows of three; a last row of two shares the width, a single last tile takes the whole row.
  const rest = tiles.length % 3;
  const span = (i: number) => (rest === 2 && i >= tiles.length - 2 ? "col-span-3" : rest === 1 && i === tiles.length - 1 ? "col-span-6" : "col-span-2");
  return (
    <main className="pb-nav">
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 text-white" style={{ paddingTop: "var(--safe-top)" }} data-testid="account-hero">
        <div className="container-app flex items-start justify-between gap-3 pb-16 pt-8">
          <h1 className="text-[1.9rem] font-black leading-tight tracking-tight">
            {t("Hi, {name}", { name: greetingName(user.name) })} <span aria-hidden>👋</span>
          </h1>
          <NotificationsBell unread={unread} label={t("Notifications")} className="relative z-10 -me-1 mt-0.5 shrink-0 bg-white/20 text-white backdrop-blur" />
        </div>
        {/* The wave the page flows out of */}
        <svg className="absolute inset-x-0 -bottom-px h-12 w-full text-cream" viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden>
          <path d="M0 30 C 90 6, 170 6, 250 22 S 360 44, 400 18 L400 48 L0 48 Z" fill="currentColor" />
          <path d="M0 30 C 90 6, 170 6, 250 22 S 360 44, 400 18" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="10" />
        </svg>
      </header>
      <div className="container-app space-y-5 pt-1">
        {active.map((o) => (
          <Link prefetch key={o.id} href={`/order/${o.reference}`} className="card flex items-center gap-3 p-4">
            <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{o.restaurantName}</div>
              <div className="text-xs text-ink-muted">{t(STATUS_META[o.status].customer)}</div>
            </div>
            <span className="tabular text-sm font-semibold">{formatMoney(o.totalCents, o.currency)}</span>
          </Link>
        ))}
        <NotifyPrompt details={user.roles.includes("ADMIN")} />
        <section className="card flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-500">
            <Globe className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold">{t("Language")}</h2>
            <p className="text-xs text-ink-muted">{t("The app, emails and notifications")}</p>
          </div>
          {/* Phones: the switch gets its own full-width row; wider screens: beside the title. */}
          <LanguageSwitcher className="w-full sm:w-auto" />
        </section>
        <nav className="grid grid-cols-6 gap-2.5" data-testid="account-tiles">
          {/* A short menu: every screen in it is ready at once, even the ones further down. */}
          <KeepLoaded hrefs={[...tiles.map((l) => l.href), "/account/notifications"]} />
          {tiles.map((l, i) => (
            <Link prefetch key={l.href} href={l.href} className={cn("card flex min-w-0 flex-col items-center rounded-3xl px-2 pb-4 pt-5 text-center transition active:scale-[0.97]", span(i))}>
              <span className={cn("grid h-16 w-16 place-items-center rounded-2xl", l.tone)}>
                <l.icon className="h-8 w-8" strokeWidth={1.8} />
              </span>
              <span className="mt-3 block text-[15px] font-extrabold leading-tight">{t(l.label)}</span>
              <span className="mt-1 line-clamp-2 text-xs leading-snug text-ink-muted">{t(l.sub)}</span>
            </Link>
          ))}
        </nav>
        <section>
          <h2 className="mb-2 font-extrabold">{t("Profile")}</h2>
          <AccountForm name={user.name} phone={user.phone ? formatPhone(user.phone) : ""} email={user.email} />
        </section>
        <form action={logoutAction}>
          <Button variant="outline" block type="submit">
            {t("Log out")}
          </Button>
        </form>
        <Link href="/account/delete" className="block text-center text-sm font-semibold text-red-600" data-testid="delete-account-link">
          {t("Delete account")}
        </Link>
        <p className="pb-2 text-center text-xs text-ink-muted">
          <Badge>{t("Cash on delivery")}</Badge> {t("is the only payment method — no card details are ever stored.")}
        </p>
      </div>
    </main>
  );
}

// Icon tile colors: a soft background with the icon in the same hue.
const TONES = {
  orange: "bg-brand-50 text-brand-500",
  amber: "bg-amber-50 text-amber-500",
  red: "bg-rose-50 text-rose-600",
  pink: "bg-pink-50 text-pink-500",
  violet: "bg-violet-50 text-violet-600",
  blue: "bg-indigo-50 text-indigo-600",
  green: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  teal: "bg-teal-50 text-teal-600",
  slate: "bg-slate-100 text-slate-700",
};

/** "Ahmad Harb" → "Ahmad"; a title stays with the name: "Mr. Ahmad" → "Mr. Ahmad". */
function greetingName(name: string) {
  const parts = name.trim().split(/\s+/);
  return /^(mr|mrs|ms|miss|dr|prof|sir)\.?$/i.test(parts[0] ?? "") && parts[1] ? `${parts[0]} ${parts[1]}` : (parts[0] ?? "");
}
