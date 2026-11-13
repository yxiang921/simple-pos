"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { History, Loader2, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { BASE_UNIT_LABEL, INPUT_UNITS, formatQty, type BaseUnitCode } from "@/lib/format";
import {
  adjustStockAction,
  createIngredientAction,
  deleteIngredientAction,
  updateIngredientAction,
} from "../../_actions/inventory";

export type IngredientRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: BaseUnitCode;
  currentStock: string;
  lowStockThreshold: string;
  isActive: boolean;
};

type Errors = Record<string, string[] | undefined>;

export function IngredientToolbar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> New ingredient
      </Button>
      {open && <CreateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function IngredientRowActions({ ingredient }: { ingredient: IngredientRow }) {
  const [dialog, setDialog] = useState<"stock" | "edit" | "delete" | null>(null);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" onClick={() => setDialog("stock")} disabled={!ingredient.isActive}>
        <PackagePlus /> Stock
      </Button>
      <Link
        href={`/admin/inventory/movements?ingredient=${ingredient.id}`}
        className="flex size-7 items-center justify-center rounded-[4px] text-muted hover:bg-hover hover:text-ink"
        aria-label={`Movement history for ${ingredient.name}`}
        title="History"
      >
        <History className="size-4" />
      </Link>
      <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${ingredient.name}`} title="Edit" onClick={() => setDialog("edit")}>
        <Pencil />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-danger hover:bg-danger-soft"
        aria-label={`Delete ${ingredient.name}`}
        title="Delete"
        onClick={() => setDialog("delete")}
      >
        <Trash2 />
      </Button>
      {dialog === "stock" && <StockDialog ingredient={ingredient} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditDialog ingredient={ingredient} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteDialog ingredient={ingredient} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: "", sku: "", unit: "G" as BaseUnitCode, initialStock: "0", lowStockThreshold: "0" });
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onClose={onClose} title="New ingredient" description="Stock is tracked in the base unit you choose here.">
      <form
        className="space-y-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await createIngredientAction(v);
            if (res.ok) {
              toast(`${v.name} added`);
              onClose();
            } else {
              setError(res.error);
              setFe(res.fieldErrors ?? {});
            }
          });
        }}
      >
        <FormError message={error} />
        <div className="grid grid-cols-[1fr_140px] gap-4">
          <Field label="Name" htmlFor="ing-name" error={fe.name}>
            <Input id="ing-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus maxLength={80} />
          </Field>
          <Field label="SKU" htmlFor="ing-sku" error={fe.sku} hint="Optional">
            <Input id="ing-sku" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} maxLength={40} />
          </Field>
        </div>
        <Field
          label="Base unit"
          htmlFor="ing-unit"
          error={fe.unit}
          hint="Weight → grams, volume → millilitres, countable → pieces. Cannot be changed later."
        >
          <Select id="ing-unit" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as BaseUnitCode })} className="w-48">
            <option value="G">Grams (g)</option>
            <option value="ML">Millilitres (ml)</option>
            <option value="PCS">Pieces (pcs)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Opening stock (${BASE_UNIT_LABEL[v.unit]})`} htmlFor="ing-stock" error={fe.initialStock}>
            <Input
              id="ing-stock"
              inputMode="decimal"
              className="tabular"
              value={v.initialStock}
              onChange={(e) => setV({ ...v, initialStock: e.target.value })}
            />
          </Field>
          <Field label={`Low-stock threshold (${BASE_UNIT_LABEL[v.unit]})`} htmlFor="ing-low" error={fe.lowStockThreshold}>
            <Input
              id="ing-low"
              inputMode="decimal"
              className="tabular"
              value={v.lowStockThreshold}
              onChange={(e) => setV({ ...v, lowStockThreshold: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !v.name.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            Add ingredient
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function EditDialog({ ingredient, onClose }: { ingredient: IngredientRow; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    name: ingredient.name,
    sku: ingredient.sku ?? "",
    lowStockThreshold: ingredient.lowStockThreshold,
    isActive: ingredient.isActive,
  });
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const unit = BASE_UNIT_LABEL[ingredient.unit];

  return (
    <Dialog open onClose={onClose} title={`Edit ${ingredient.name}`} description={`Base unit: ${unit}. Use Stock to change quantities.`}>
      <form
        className="space-y-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await updateIngredientAction({ id: ingredient.id, ...v });
            if (res.ok) {
              toast("Ingredient updated");
              onClose();
            } else {
              setError(res.error);
              setFe(res.fieldErrors ?? {});
            }
          });
        }}
      >
        <FormError message={error} />
        <div className="grid grid-cols-[1fr_140px] gap-4">
          <Field label="Name" htmlFor="ed-name" error={fe.name}>
            <Input id="ed-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} />
          </Field>
          <Field label="SKU" htmlFor="ed-sku" error={fe.sku}>
            <Input id="ed-sku" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} maxLength={40} />
          </Field>
        </div>
        <Field label={`Low-stock threshold (${unit})`} htmlFor="ed-low" error={fe.lowStockThreshold}>
          <Input
            id="ed-low"
            inputMode="decimal"
            className="tabular w-40"
            value={v.lowStockThreshold}
            onChange={(e) => setV({ ...v, lowStockThreshold: e.target.value })}
          />
        </Field>
        <Checkbox
          label="Active — inactive ingredients make their menu items unavailable"
          checked={v.isActive}
          onChange={(e) => setV({ ...v, isActive: e.target.checked })}
        />
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function StockDialog({ ingredient, onClose }: { ingredient: IngredientRow; onClose: () => void }) {
  const toast = useToast();
  const units = INPUT_UNITS[ingredient.unit];
  const [kind, setKind] = useState<"RESTOCK" | "DEDUCT">("RESTOCK");
  const [quantity, setQuantity] = useState("");
  const [inputUnit, setInputUnit] = useState(units[0].value);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={`Adjust stock · ${ingredient.name}`}
      description={`Current: ${formatQty(ingredient.currentStock, ingredient.unit)}`}
    >
      <form
        className="space-y-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (kind === "DEDUCT" && !reason.trim()) {
            setError("Please give a reason for deducting stock.");
            return;
          }
          startTransition(async () => {
            const res = await adjustStockAction({ ingredientId: ingredient.id, kind, quantity, inputUnit, reason });
            if (res.ok) {
              toast(`${ingredient.name}: now ${formatQty(res.data.balanceAfter, ingredient.unit)}`);
              onClose();
            } else setError(res.error);
          });
        }}
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line-strong bg-line-strong">
          {(["RESTOCK", "DEDUCT"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-8 text-[13px] ${kind === k ? "bg-primary text-white" : "bg-surface hover:bg-hover"}`}
              aria-pressed={kind === k}
            >
              {k === "RESTOCK" ? "Restock (add)" : "Wastage / correction"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Quantity" htmlFor="adj-qty">
            <Input
              id="adj-qty"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="tabular"
              autoFocus
            />
          </Field>
          <Field label="Unit" htmlFor="adj-unit">
            <Select id="adj-unit" value={inputUnit} onChange={(e) => setInputUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={kind === "RESTOCK" ? "Note (optional)" : "Reason"} htmlFor="adj-reason">
          <Input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === "RESTOCK" ? "e.g. Supplier delivery INV-2231" : "e.g. Expired, spillage, stock count"}
            maxLength={200}
          />
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={kind === "RESTOCK" ? "primary" : "danger"} disabled={pending || !quantity}>
            {pending && <Loader2 className="animate-spin" />}
            {kind === "RESTOCK" ? "Add stock" : "Deduct stock"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ ingredient, onClose }: { ingredient: IngredientRow; onClose: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={`Delete ${ingredient.name}?`}
      description="Only ingredients never used in a recipe or order can be deleted. Otherwise, deactivate it."
    >
      <FormError message={error} />
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteIngredientAction(ingredient.id);
              if (res.ok) {
                toast(`${ingredient.name} deleted`);
                onClose();
              } else setError(res.error);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
