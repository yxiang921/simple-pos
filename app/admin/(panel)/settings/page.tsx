import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { PasswordForm, StoreForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 } });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Store" />
          <StoreForm
            storeName={settings?.storeName ?? "Kopi & Co."}
            acceptingOrders={settings?.acceptingOrders ?? true}
            openTime={settings?.openTime ?? ""}
            closeTime={settings?.closeTime ?? ""}
            timezone={settings?.timezone ?? "Asia/Kuala_Lumpur"}
            orderAlertMinutes={settings?.orderAlertMinutes ?? 20}
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
