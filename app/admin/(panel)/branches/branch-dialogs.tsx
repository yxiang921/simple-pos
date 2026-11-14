"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { slugify } from "@/lib/slug";
import { saveBranchAction } from "../../_actions/branches";

export type BranchRow = { id: string; name: string; slug: string; address: string; isActive: boolean; isHeadquarters: boolean };

export function BranchToolbar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> New branch
      </Button>
      {open && <BranchDialog branch={null} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BranchRowActions({ branch }: { branch: BranchRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${branch.name}`} title="Edit" onClick={() => setOpen(true)}>
        <Pencil />
      </Button>
      {open && <BranchDialog branch={branch} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Guest link with copy + open buttons (the origin is only known in the browser). */
export function CopyLink({ path, disabled }: { path: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <code className="max-w-[220px] truncate text-[12px] text-ink">{path}</code>
      <button
        type="button"
        className="press flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
        title="Copy full link"
        aria-label="Copy link"
        onClick={async () => {
          await navigator.clipboard?.writeText(`${window.location.origin}${path}`).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      </button>
      {!disabled && (
        <a href={path} target="_blank" rel="noreferrer" className="press flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" title="Open guest menu">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

function BranchDialog({ branch, onClose }: { branch: BranchRow | null; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    name: branch?.name ?? "",
    slug: branch?.slug ?? "",
    address: branch?.address ?? "",
    isActive: branch?.isActive ?? true,
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(branch));
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();

  return (
    <Dialog
      open
      onClose={onClose}
      title={branch ? `Edit ${branch.name}` : "New branch"}
      description={branch ? undefined : "The new branch sells your shared menu and starts with zero stock of every ingredient."}
    >
      <form
        className="space-y-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveBranchAction(branch?.id ?? null, v);
            if (res.ok) {
              toast(branch ? "Branch updated" : `${v.name} opened`);
              onClose();
            } else {
              setError(res.error);
              setFe(res.fieldErrors ?? {});
            }
          });
        }}
      >
        <FormError message={error} />
        <Field label="Branch name" htmlFor="br-name" error={fe.name}>
          <Input
            id="br-name"
            value={v.name}
            maxLength={60}
            autoFocus
            onChange={(e) => setV({ ...v, name: e.target.value, slug: slugTouched ? v.slug : slugify(e.target.value, "") })}
            placeholder="e.g. Mount Austin"
          />
        </Field>
        <Field label="URL name" htmlFor="br-slug" error={fe.slug} hint="Used in the guest link. Changing it breaks printed QR codes.">
          <Input
            id="br-slug"
            value={v.slug}
            maxLength={40}
            onChange={(e) => {
              setSlugTouched(true);
              setV({ ...v, slug: e.target.value.toLowerCase() });
            }}
            placeholder="mount-austin"
          />
        </Field>
        <Field label="Address" htmlFor="br-address" error={fe.address} hint="Optional">
          <Input id="br-address" value={v.address} maxLength={200} onChange={(e) => setV({ ...v, address: e.target.value })} />
        </Field>
        {branch && !branch.isHeadquarters && (
          <Checkbox
            label="Open — closed branches stop taking guest orders (history is kept)"
            checked={v.isActive}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
        )}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !v.name.trim() || !v.slug.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            {branch ? "Save" : "Open branch"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
