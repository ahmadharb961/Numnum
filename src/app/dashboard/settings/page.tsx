import type { Metadata } from "next";
import { requireRestaurant, canAccess } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { DashPage, Section } from "@/components/dashboard/page";
import { ProfileForm, OrderingForm, HoursEditor } from "@/components/dashboard/settings-forms";
import { Alert } from "@/components/ui/misc";
import { minorDigits } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import type { OpeningHours } from "@/lib/hours";
import Link from "next/link";
import { normalizeZones } from "@/lib/geo";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Settings") };
}

export default async function SettingsPage() {
  const t = await getT();
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const settings = await getSettings();
  const d = minorDigits(r.currency);
  const fmt = (c: number | null) => (c == null ? "" : (c / 10 ** d).toFixed(d));
  const social = (r.socialLinks ?? {}) as Record<string, string>;
  return (
    <DashPage title={t("Restaurant settings")}>
      <Section title={t("Business details")} description={t("Shown on your public profile.")}>
        <ProfileForm
          r={{ displayName: r.displayName, businessName: r.businessName, description: r.description ?? "", cuisine: r.cuisine ?? "", phone: r.phone ? formatPhone(r.phone) : "", email: r.email ?? "", address: r.address ?? "", area: r.area ?? "", city: r.city ?? "", mapsUrl: r.mapsUrl ?? "", latitude: r.latitude?.toString() ?? "", longitude: r.longitude?.toString() ?? "", logoUrl: r.logoUrl ?? "", coverUrl: r.coverUrl ?? "", ...social }}
        />
      </Section>
      <Section id="ordering" title={t("Online ordering, delivery & pickup")}>
        {canAccess(ctx.staffRole, "OWNER") ? (
          <>
            {!r.agreementAcceptedAt && (
              <Alert className="mb-4">
                {t("Accept the")} <Link href="/dashboard/agreement" className="font-semibold underline">{t("commission agreement")}</Link> {t("to switch on online ordering.")}
              </Alert>
            )}
            <OrderingForm
              agreementAccepted={!!r.agreementAcceptedAt}
              currencies={settings.supportedCurrencies}
              r={{ avgPrepMinutes: String(r.avgPrepMinutes), deliveryEnabled: r.deliveryEnabled, pickupEnabled: r.pickupEnabled, minOrder: fmt(r.minOrderCents), currency: r.currency, orderingEnabled: r.orderingEnabled, latitude: r.latitude, longitude: r.longitude, zones: normalizeZones(r.deliveryZones).map((z) => ({ maxKm: String(z.maxKm), fee: fmt(z.feeCents) })) }}
            />
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t("Only the owner can change ordering settings.")}</p>
        )}
      </Section>
      <Section title={t("Opening hours")} description={t("Times are in Beirut time. Use a closing time after midnight (e.g. 02:00) for late nights.")}>
        <HoursEditor initial={(r.openingHours ?? {}) as OpeningHours} />
      </Section>
    </DashPage>
  );
}
