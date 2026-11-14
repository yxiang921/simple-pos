import type { Metadata } from "next";
import { requireContext } from "@/lib/tenant";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { PasswordForm, StoreForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { admin, settings, branches } = await requireContext();

  return (
    <>
      <PageHeader
        title="Settings"
        description={branches.length > 1 ? `These settings apply to all ${branches.length} branches.` : undefined}
      />
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Store" />
          <StoreForm
            storeName={settings.storeName}
            acceptingOrders={settings.acceptingOrders}
            openTime={settings.openTime ?? ""}
            closeTime={settings.closeTime ?? ""}
            timezone={settings.timezone}
            orderAlertMinutes={settings.orderAlertMinutes}
          />
        </Panel>
        <Panel>
          <PanelHeader title="Account" />
          <div className="border-b border-line px-4 py-3 text-[13px]">
            <p className="text-muted">Signed in as</p>
            <p className="font-medium">{admin.email}</p>
          </div>
          <PasswordForm />
        </Panel>
      </div>
    </>
  );
}
