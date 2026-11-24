import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/app/page";
import { SettingsForm } from "./form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePermission("settings:view");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" breadcrumbs={[{ href: "/admin", label: "Admin" }]} description="Tax, fee and rate values change over time — keep them current here. Existing transactions keep the values snapshotted at reservation." />
      <SettingsForm initial={settings} readOnly={!can(user, "settings:update")} />
    </>
  );
}
