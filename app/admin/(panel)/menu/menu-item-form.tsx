"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { BASE_UNIT_LABEL, INPUT_UNITS, formatQty, type BaseUnitCode } from "@/lib/format";
import { saveMenuItemAction } from "../../_actions/menu";

export type IngredientOption = { id: string; name: string; unit: BaseUnitCode; isActive: boolean; currentStock: string };
type RecipeRow = { key: number; ingredientId: string; quantity: string; inputUnit: string };

export type MenuItemFormValues = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  isAvailable: boolean;
  /** "yes" | "no" | "" (not set) */
  isPreparedAhead: "yes" | "no" | "";
  /** comma-separated */
  aliases: string;
  recipe: { ingredientId: string; quantity: string; inputUnit: string }[];
};

let rowKey = 1;

export function MenuItemForm({
  id,
  initial,
  categories,
  ingredients,
  stockLabel = "In stock",
}: {
  id: string | null;
  initial: MenuItemFormValues;
  categories: { id: string; name: string }[];
  ingredients: IngredientOption[];
  stockLabel?: string;
}) {
  const [values, setValues] = useState(initial);
  const [rows, setRows] = useState<RecipeRow[]>(() => initial.recipe.map((r) => ({ ...r, key: rowKey++ })));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const set = <K extends keyof MenuItemFormValues>(k: K, v: MenuItemFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  function updateRow(key: number, patch: Partial<RecipeRow>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Reset unit when the ingredient (and therefore its base unit) changes.
        if (patch.ingredientId !== undefined) {
          const ing = byId.get(patch.ingredientId);
          next.inputUnit = ing ? INPUT_UNITS[ing.unit][0].value : "";
        }
        return next;
      }),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const recipe = rows.filter((r) => r.ingredientId || r.quantity);
    if (recipe.some((r) => !r.ingredientId || !r.quantity)) {
      setError("Each recipe line needs an ingredient and a quantity.");
      return;
    }
    startTransition(async () => {
      const res = await saveMenuItemAction(id, {
        ...values,
        recipe: recipe.map(({ ingredientId, quantity, inputUnit }) => ({ ingredientId, quantity, inputUnit })),
      });
      // On success the action redirects; we only get here on failure.
      if (res && !res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  const usedIds = new Set(rows.map((r) => r.ingredientId));

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" noValidate>
      <Panel>
        <PanelHeader title="Details" />
        <div className="space-y-4 p-4">
          <FormError message={error} />
          <Field label="Name" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={100} required />
          </Field>
          <Field label="Description" htmlFor="description" error={fieldErrors.description} hint="Shown to guests. Keep it short.">
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={500}
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (RM)" htmlFor="price" error={fieldErrors.price}>
              <Input
                id="price"
                inputMode="decimal"
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
            </Field>
            <Field label="Category" htmlFor="categoryId" error={fieldErrors.categoryId}>
              <Select id="categoryId" value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Image URL" htmlFor="imageUrl" error={fieldErrors.imageUrl} hint="Optional. A square photo works best.">
            <div className="flex gap-3">
              <Input
                id="imageUrl"
                value={values.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="https://…"
              />
              {values.imageUrl && /^https?:\/\//.test(values.imageUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.imageUrl} alt="" className="size-9 shrink-0 rounded-[4px] border border-line object-cover" />
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Preparation"
              htmlFor="isPreparedAhead"
              error={fieldErrors.isPreparedAhead}
              hint="Cooked in bulk each morning, or made when ordered?"
            >
              <Select
                id="isPreparedAhead"
                value={values.isPreparedAhead}
                onChange={(e) => set("isPreparedAhead", e.target.value as MenuItemFormValues["isPreparedAhead"])}
              >
                <option value="">Not set</option>
                <option value="yes">Prepared ahead</option>
                <option value="no">Made to order</option>
              </Select>
            </Field>
            <Field label="Also called" htmlFor="aliases" error={fieldErrors.aliases} hint="Comma-separated, e.g. ayam, nl ayam">
              <Input id="aliases" value={values.aliases} onChange={(e) => set("aliases", e.target.value)} maxLength={500} />
            </Field>
          </div>
          <Checkbox
            label="Available on the guest menu"
            checked={values.isAvailable}
            onChange={(e) => set("isAvailable", e.target.checked)}
          />
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Recipe (per serving)"
            actions={
              <Button
                size="sm"
                onClick={() => setRows((rs) => [...rs, { key: rowKey++, ingredientId: "", quantity: "", inputUnit: "" }])}
              >
                <Plus /> Add ingredient
              </Button>
            }
          />
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">
              No ingredients. Orders for this item will not deduct any stock. Add ingredients so inventory updates
              automatically.
            </p>
          ) : (
            <div className="divide-y divide-line">
              <div className="grid grid-cols-[minmax(0,1fr)_110px_84px_32px] gap-2 bg-[#fafaf8] px-4 py-2 text-[12px] font-medium uppercase tracking-[0.03em] text-muted">
                <span>Ingredient</span>
                <span>Quantity</span>
                <span>Unit</span>
                <span />
              </div>
              {rows.map((r) => {
                const ing = byId.get(r.ingredientId);
                return (
                  <div key={r.key} className="px-4 py-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px_84px_32px] items-center gap-2">
                      <Select
                        aria-label="Ingredient"
                        value={r.ingredientId}
                        onChange={(e) => updateRow(r.key, { ingredientId: e.target.value })}
                      >
                        <option value="">Select ingredient…</option>
                        {ingredients.map((i) => (
                          <option key={i.id} value={i.id} disabled={usedIds.has(i.id) && i.id !== r.ingredientId}>
                            {i.name} ({BASE_UNIT_LABEL[i.unit]}){i.isActive ? "" : " — inactive"}
                          </option>
                        ))}
                      </Select>
                      <Input
                        aria-label="Quantity"
                        inputMode="decimal"
                        value={r.quantity}
                        onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                        placeholder="0"
                        className="tabular"
                      />
                      <Select
                        aria-label="Unit"
                        value={r.inputUnit}
                        onChange={(e) => updateRow(r.key, { inputUnit: e.target.value })}
                        disabled={!ing}
                      >
                        {ing ? (
                          INPUT_UNITS[ing.unit].map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))
                        ) : (
                          <option value="">—</option>
                        )}
                      </Select>
                      <button
                        type="button"
                        aria-label="Remove ingredient"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        className="flex size-8 items-center justify-center rounded-[4px] text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {ing && (
                      <p className="mt-1 text-[12px] text-muted">
                        {stockLabel}: {formatQty(ing.currentStock, ing.unit)}
                        {!ing.isActive && <span className="text-warning"> · inactive — item will show as sold out</span>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {fieldErrors.recipe && <p className="px-4 pb-3 text-[12px] text-danger">{fieldErrors.recipe[0]}</p>}
        </Panel>

        <div className="flex justify-end gap-2">
          <Link href="/admin/menu" className={buttonClass("secondary")}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={pending} className="min-w-[110px]">
            {pending && <Loader2 className="animate-spin" />}
            {id ? "Save changes" : "Create item"}
          </Button>
        </div>
      </div>
    </form>
  );
}
