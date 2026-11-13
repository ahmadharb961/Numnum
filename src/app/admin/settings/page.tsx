import { getSettings } from "@/server/settings";
import { imagesConfigured, photoCounts } from "@/server/cf-images";
import { DashPage } from "@/components/dashboard/page";
import { SettingsForm } from "@/components/admin/settings-form";
import { CloudflarePhotos } from "@/components/admin/cloudflare-photos";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [s, photos] = await Promise.all([getSettings(), photoCounts()]);
  return (
    <DashPage title="Global settings" description="Changes are audit-logged. Commission changes apply only to future billable events.">
      <SettingsForm initial={s} />
      <CloudflarePhotos initial={photos} configured={imagesConfigured()} />
    </DashPage>
  );
}
