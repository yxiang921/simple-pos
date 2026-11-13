"use client";

import { useActionState, useEffect, useRef } from "react";
import { Checkbox, Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { saveSettingsAction } from "../../_actions/settings";
import { changePasswordAction } from "../../_actions/auth";

export function StoreForm({
  storeName,
  acceptingOrders,
  openTime,
  closeTime,
  timezone,
}: {
  storeName: string;
  acceptingOrders: boolean;
  openTime: string;
  closeTime: string;
  timezone: string;
}) {
  const toast = useToast();
  const [state, action] = useActionState(saveSettingsAction, null);
  useEffect(() => {
    if (state?.ok) toast("Settings saved");
  }, [state, toast]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4 p-4">
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label="Store name" htmlFor="storeName" error={fe?.storeName} hint="Shown on the guest menu and receipts.">
        <Input id="storeName" name="storeName" defaultValue={storeName} maxLength={80} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Opens" htmlFor="openTime" error={fe?.openTime}>
          <Input id="openTime" name="openTime" type="time" defaultValue={openTime} />
        </Field>
        <Field label="Closes" htmlFor="closeTime" error={fe?.closeTime}>
          <Input id="closeTime" name="closeTime" type="time" defaultValue={closeTime} />
        </Field>
        <Field label="Time zone" htmlFor="timezone" error={fe?.timezone}>
          <Input id="timezone" name="timezone" defaultValue={timezone} maxLength={64} />
        </Field>
      </div>
      <div>
        <Checkbox name="acceptingOrders" defaultChecked={acceptingOrders} label="Accept new guest orders" />
        <p className="ml-6 mt-0.5 text-[12px] text-muted">Untick to pause ordering, e.g. at closing time.</p>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(changePasswordAction, null);
  useEffect(() => {
    if (state?.ok) {
      toast("Password changed. Other sessions were signed out.");
      ref.current?.reset();
    }
  }, [state, toast]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={ref} action={action} className="space-y-4 p-4">
      <FormError message={state && !state.ok && !fe ? state.error : null} />
      <Field label="Current password" htmlFor="currentPassword" error={fe?.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={fe?.newPassword} hint="At least 10 characters.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={fe?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingText="Updating…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}
