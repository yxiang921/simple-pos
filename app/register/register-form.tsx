"use client";

import { useActionState, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Check, X } from "lucide-react";
import { Checkbox, Field, FormError, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { SLUG_RE, slugify } from "@/lib/slug";
import { checkSlugAction, registerAction } from "./actions";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  // Controlled so values survive React's form reset after a failed attempt.
  const [v, setV] = useState({ businessName: "", slug: "", ownerName: "", email: "", branchNames: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [hasBranches, setHasBranches] = useState(false);
  const [sample, setSample] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!SLUG_RE.test(v.slug) || v.slug.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const ok = await checkSlugAction(v.slug);
      if (live) setAvailable(ok);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [v.slug]);
  const slugValid = SLUG_RE.test(v.slug) && v.slug.length >= 2;

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError message={state && !state.ok ? state.error : null} />

      <fieldset className="space-y-4">
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">Business</legend>
        <Field label="Business name" htmlFor="businessName" error={fe?.businessName}>
          <Input
            id="businessName"
            name="businessName"
            value={v.businessName}
            maxLength={80}
            autoFocus
            placeholder="e.g. Kopi & Co."
            onChange={(e) => {
              const businessName = e.target.value;
              const slug = slugTouched ? v.slug : slugify(businessName, "");
              setV({ ...v, businessName, slug });
              if (!slugTouched) setAvailable(null);
            }}
          />
        </Field>
        <Field
          label="Shop URL"
          htmlFor="slug"
          error={fe?.slug}
          hint={
            slugValid && available !== null ? (
              <span className={clsx("inline-flex items-center gap-1", available ? "text-primary" : "text-danger")}>
                {available ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {available ? "Available" : "Already taken"}
              </span>
            ) : (
              "Lowercase letters, numbers and dashes. Guests order at this address."
            )
          }
        >
          <div className="flex items-stretch overflow-hidden rounded-[4px] border border-line-strong focus-within:border-primary">
            <span className="flex items-center border-r border-line bg-[#fafaf8] px-2.5 text-[13px] text-muted">/s/</span>
            <input
              id="slug"
              name="slug"
              value={v.slug}
              maxLength={40}
              onChange={(e) => {
                setSlugTouched(true);
                setAvailable(null);
                setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
              }}
              className="h-9 min-w-0 flex-1 bg-surface px-2.5 text-[14px] outline-none"
              placeholder="kopi-co"
              aria-invalid={!!fe?.slug}
            />
          </div>
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">Outlets</legend>
        <div className="grid gap-px overflow-hidden rounded-[4px] border border-line-strong bg-line-strong sm:grid-cols-2">
          {[
            { value: false, title: "Single outlet", text: "One shop." },
            { value: true, title: "Headquarters with branches", text: "Shared menu, separate orders and stock per branch." },
          ].map((o) => (
            <label
              key={String(o.value)}
              className={clsx("flex cursor-pointer gap-2.5 px-3 py-2.5", hasBranches === o.value ? "bg-primary-soft" : "bg-surface hover:bg-hover")}
            >
              <input type="radio" name="_outlets" className="mt-0.5 accent-[#285943]" checked={hasBranches === o.value} onChange={() => setHasBranches(o.value)} />
              <span>
                <span className="block text-[13px] font-medium">{o.title}</span>
                <span className="block text-[12px] text-muted">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
        <input type="hidden" name="hasBranches" value={hasBranches ? "true" : "false"} />
        {hasBranches && (
          <Field
            label="Branch names"
            htmlFor="branchNames"
            error={fe?.branchNames}
            hint="One per line, besides headquarters. You can add more later."
          >
            <Textarea
              id="branchNames"
              name="branchNames"
              rows={3}
              value={v.branchNames}
              onChange={(e) => setV({ ...v, branchNames: e.target.value })}
              placeholder={"Mount Austin\nSkudai"}
            />
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">Owner account</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="ownerName" error={fe?.ownerName}>
            <Input id="ownerName" name="ownerName" value={v.ownerName} maxLength={80} autoComplete="name" onChange={(e) => setV({ ...v, ownerName: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="email" error={fe?.email}>
            <Input id="email" name="email" type="email" value={v.email} autoComplete="username" onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Password" htmlFor="password" error={fe?.password} hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" />
        </Field>
      </fieldset>

      <div className="rounded-[4px] border border-line bg-[#fafaf8] px-3 py-2.5">
        <Checkbox
          name="sampleData"
          value="true"
          checked={sample}
          onChange={(e) => setSample(e.target.checked)}
          label="Start with a sample café menu, ingredients and floor plan (you can edit or delete them)"
        />
      </div>

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Creating your shop…">
        Create my shop
      </SubmitButton>
    </form>
  );
}
