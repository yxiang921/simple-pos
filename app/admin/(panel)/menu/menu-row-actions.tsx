"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteMenuItemAction, toggleMenuItemAvailabilityAction } from "../../_actions/menu";

export function MenuRowActions({
  id,
  name,
  isAvailable,
  scope = null,
  locked = false,
}: {
  id: string;
  name: string;
  isAvailable: boolean;
  /** "Mount Austin" / "all branches" — where Hide / Show applies (null for single-outlet shops). */
  scope?: string | null;
  /** Hidden for every branch: can only be shown again from "All branches". */
  locked?: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        disabled={pending || locked}
        title={locked ? "Hidden at every branch — show it again from All branches" : scope ? `${isAvailable ? "Hide" : "Show"} at ${scope}` : undefined}
        className="min-w-[56px]"
        onClick={() =>
          startTransition(async () => {
            const res = await toggleMenuItemAvailabilityAction(id, !isAvailable);
            const where = scope ? ` at ${scope}` : "";
            if (res.ok) toast(isAvailable ? `${name} hidden from menu${where}` : `${name} is back on the menu${where}`);
            else toast(res.error, "error");
          })
        }
      >
        {pending && !confirm ? <Loader2 className="animate-spin" /> : isAvailable ? "Hide" : "Show"}
      </Button>
      <ButtonLink href={`/admin/menu/${id}/edit`} size="icon" variant="ghost" className="size-7" aria-label={`Edit ${name}`} title="Edit">
        <Pencil />
      </ButtonLink>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-danger hover:bg-danger-soft"
        aria-label={`Delete ${name}`}
        title="Delete"
        onClick={() => setConfirm(true)}
      >
        <Trash2 />
      </Button>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        width="sm"
        title={`Delete "${name}"?`}
        description="Items with past orders are archived instead, so order history stays intact."
      >
        <DialogFooter>
          <Button onClick={() => setConfirm(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteMenuItemAction(id);
                if (res.ok) {
                  toast(res.data === "archived" ? `${name} archived (has order history)` : `${name} deleted`);
                  setConfirm(false);
                } else toast(res.error, "error");
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
