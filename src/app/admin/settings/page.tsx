import { getSettings } from "@/server/settings";
import { DashPage } from "@/components/dashboard/page";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const s = await getSettings();
  return (
    <DashPage title="Global settings" description="Changes are audit-logged. Commission changes apply only to future billable events.">
      <SettingsForm initial={s} />
    </DashPage>
  );
}
