"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Loader2, PackageCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { BASE_UNIT_LABEL, COST_UNIT, INPUT_UNITS, formatQty, formatRM, toCents, centsToString, type BaseUnitCode } from "@/lib/format";
import { receiveStockAction } from "../../../../_actions/stock-in";

export type StockInIngredient = {
  id: string;
  name: string;
  sku: string | null;
  unit: BaseUnitCode;
  costPerDisplay: string | null;
  stock: Record<string, { current: string; low: string }>;
};

type Line = { key: number; ingredientId: string; quantity: string; inputUnit: string; lineCost: string };
let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, ingredientId: "", quantity: "", inputUnit: "", lineCost: "" });

/** Quantity typed in `unit` → base units (display only; the server converts exactly). */
function toBase(qty: string, unit: string, base: BaseUnitCode) {
  const f = INPUT_UNITS[base].find((u) => u.value === unit)?.factor ?? "1";
  const n = Number(qty);
  return Number.isFinite(n) ? n * Number(f) : NaN;
}

export function StockInForm({
  ingredients,
  suppliers,
  branches,
  currentBranch,
  hqId,
  today,
}: {
  ingredients: StockInIngredient[];
  suppliers: string[];
  branches: { id: string; name: string }[];
  currentBranch: string | null;
  hqId: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [branchId, setBranchId] = useState(currentBranch ?? hqId);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [note, setNote] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [lines, setLines] = useState<Line[]>(() => [blank()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const multi = branches.length > 1;

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.ingredientId).filter(Boolean));
  const filled = lines.filter((l) => l.ingredientId && Number(l.quantity) > 0);
  const totalCents = lines.reduce((s, l) => s + (l.lineCost ? toCents(l.lineCost) : 0), 0);
  const low = ingredients.filter((i) => {
    const s = i.stock[branchId];
    return s && Number(s.current) <= Number(s.low) && Number(s.low) > 0;
  });

  function addLowStock() {
    const add = low
      .filter((i) => !used.has(i.id))
      .map((i) => {
        const s = i.stock[branchId];
        // Suggest enough to reach twice the low-stock level, in a friendly unit.
        const need = Math.max(0, Number(s.low) * 2 - Number(s.current));
        const big = i.unit !== "PCS" && need >= 1000;
        return {
          key: nextKey++,
          ingredientId: i.id,
          quantity: big ? String(Math.ceil(need / 100) / 10) : String(Math.ceil(need)),
          inputUnit: big ? (i.unit === "G" ? "kg" : "L") : BASE_UNIT_LABEL[i.unit],
          lineCost: "",
        };
      });
    if (!add.length) return toast("No low-stock ingredients to add at this branch.", "error");
    setLines((ls) => [...ls.filter((l) => l.ingredientId), ...add]);
  }

  function submit() {
    setError(null);
    if (!filled.length) return setError("Add at least one ingredient with a quantity.");
    start(async () => {
      const res = await receiveStockAction({
        branchId,
        supplier,
        reference,
        note,
        receivedDate,
        updateCosts,
        lines: filled.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity.trim(),
          inputUnit: l.inputUnit || BASE_UNIT_LABEL[byId.get(l.ingredientId)!.unit],
          lineCost: l.lineCost.trim() || null,
        })),
      });
      if (res.ok) {
        toast(`Delivery #${String(res.data.receiptNumber).padStart(4, "0")} received · ${res.data.lines} item(s) added to stock`);
        router.push(`/admin/inventory/stock-in/${res.data.id}`);
      } else setError(res.error);
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <PanelHeader
          title="Items received"
          actions={
            <div className="flex gap-1.5">
              <Button size="sm" onClick={addLowStock} disabled={!low.length} title="Add every low-stock ingredient at this branch">
                <Sparkles /> Low stock{low.length ? ` (${low.length})` : ""}
              </Button>
              <Button size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                <Plus /> Add line
              </Button>
            </div>
          }
        />
        <div className="hidden grid-cols-[minmax(0,1.6fr)_110px_84px_120px_minmax(0,1fr)_32px] gap-2 border-b border-line bg-fill/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle md:grid">
          <span>Ingredient</span>
          <span>Quantity</span>
          <span>Unit</span>
          <span>Cost (RM)</span>
          <span>Stock</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const ing = byId.get(l.ingredientId);
            const units = ing ? INPUT_UNITS[ing.unit] : [];
            const unit = l.inputUnit || (ing ? BASE_UNIT_LABEL[ing.unit] : "");
            const s = ing?.stock[branchId];
            const add = ing ? toBase(l.quantity, unit, ing.unit) : NaN;
            const after = s && Number.isFinite(add) && add > 0 ? Number(s.current) + add : null;
            const perUnit =
              ing && l.lineCost && Number(l.lineCost) > 0 && add > 0
                ? (Number(l.lineCost) / add) * COST_UNIT[ing.unit].factor
                : null;
            return (
              <li key={l.key} className="animate-fade-up grid grid-cols-2 gap-2 px-5 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_84px_120px_minmax(0,1fr)_32px] md:items-center">
                <Select
                  className="col-span-2 md:col-span-1"
                  value={l.ingredientId}
                  onChange={(e) => set(l.key, { ingredientId: e.target.value, inputUnit: "" })}
                  aria-label="Ingredient"
                >
                  <option value="">Choose ingredient…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id} disabled={used.has(i.id) && i.id !== l.ingredientId}>
                      {i.name}
                      {i.sku ? ` · ${i.sku}` : ""}
                    </option>
                  ))}
                </Select>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  className="tabular"
                  value={l.quantity}
                  onChange={(e) => set(l.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                  aria-label="Quantity"
                />
                <Select value={unit} onChange={(e) => set(l.key, { inputUnit: e.target.value })} disabled={!ing} aria-label="Unit">
                  {units.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </Select>
                <div>
                  <Input
                    inputMode="decimal"
                    placeholder={ing?.costPerDisplay ? `≈ ${ing.costPerDisplay}/${COST_UNIT[ing.unit].value}` : "Optional"}
                    className="tabular"
                    value={l.lineCost}
                    onChange={(e) => set(l.key, { lineCost: e.target.value.replace(/[^\d.]/g, "") })}
                    aria-label="Line cost in RM"
                  />
                </div>
                <div className="col-span-2 text-[12px] leading-tight text-muted md:col-span-1">
                  {ing && s ? (
                    <>
                      <span className="tabular">{formatQty(s.current, ing.unit)}</span>
                      {after !== null && (
                        <>
                          <ArrowRight className="mx-1 inline size-3 text-subtle" />
                          <span className="tabular font-semibold text-success">{formatQty(after, ing.unit)}</span>
                        </>
                      )}
                      {perUnit !== null && (
                        <span className="tabular block text-[11px]">
                          {formatRM(perUnit.toFixed(2))}/{COST_UNIT[ing.unit].value}
                        </span>
                      )}
                    </>
                  ) : ing ? (
                    "Not stocked here yet"
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}
                  className="press flex size-8 items-center justify-center justify-self-end rounded-full text-muted hover:bg-danger-soft hover:text-danger"
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-line bg-fill/40 px-5 py-3 text-[13px]">
          <span className="text-muted">
            {filled.length} item{filled.length === 1 ? "" : "s"}
          </span>
          <span className="tabular font-semibold">Total {totalCents ? formatRM(centsToString(totalCents)) : "—"}</span>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Delivery" />
          <div className="space-y-4 px-5 py-4">
            {multi && (
              <Field label="Branch" htmlFor="si-branch" hint={currentBranch ? undefined : "Where the goods arrived"}>
                <Select id="si-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!!currentBranch}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Supplier" htmlFor="si-supplier" hint="Optional">
              <Input id="si-supplier" list="si-suppliers" value={supplier} maxLength={80} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Pasar Borong JB" />
              <datalist id="si-suppliers">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice / DO no." htmlFor="si-ref">
                <Input id="si-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="INV-2231" />
              </Field>
              <Field label="Received" htmlFor="si-date">
                <Input id="si-date" type="date" value={receivedDate} max={today} onChange={(e) => setReceivedDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Note" htmlFor="si-note" hint="Optional">
              <Textarea id="si-note" rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Checkbox
              label="Update ingredient costs from the line costs"
              checked={updateCosts}
              onChange={(e) => setUpdateCosts(e.target.checked)}
              className="text-[13px]"
            />
          </div>
        </Panel>
        <FormError message={error} />
        <Button variant="primary" size="lg" className={clsx("w-full")} onClick={submit} disabled={pending || !filled.length}>
          {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          Receive {filled.length || ""} item{filled.length === 1 ? "" : "s"}
        </Button>
        <p className="px-1 text-[12px] leading-relaxed text-muted">
          Stock is added right away and each line appears in Stock movements. To remove stock (wastage, mistakes) use Inventory → Stock.
        </p>
      </div>
    </div>
  );
}
