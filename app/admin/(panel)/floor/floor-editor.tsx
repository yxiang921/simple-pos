"use client";

import { useEffect } from "react";
import { Copy, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { KIND_DEFAULTS, KIND_LABEL, normalizeTableNumber, type FloorKind, type FloorObjectData } from "@/lib/floor";

export type Draft = { width: number; depth: number; objects: FloorObjectData[] };

const ADD_TABLES: { label: string; seats: number; shape: "RECT" | "ROUND"; width: number; depth: number }[] = [
  { label: "2 seats", seats: 2, shape: "RECT", width: 0.7, depth: 0.7 },
  { label: "4 seats", seats: 4, shape: "RECT", width: 0.9, depth: 0.9 },
  { label: "Round 4", seats: 4, shape: "ROUND", width: 1.0, depth: 1.0 },
  { label: "6 seats", seats: 6, shape: "RECT", width: 1.8, depth: 0.9 },
];
const ADD_FIXTURES: FloorKind[] = ["COUNTER", "PASS", "KITCHEN", "BAR", "ENTRANCE", "WALL", "PLANT"];

let seq = 0;
const tempId = () => `new-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Rough radius an object occupies, including chairs around tables. */
function reach(o: { kind: FloorKind; width: number; depth: number; seats: number | null }) {
  return Math.hypot(o.width, o.depth) / 2 + (o.kind === "TABLE" && o.seats ? 0.55 : 0.1);
}

/** Free spot for a new object: the grid point nearest the centre that doesn't overlap anything. */
function freeSpot(d: Draft, obj: { kind: FloorKind; width: number; depth: number; seats: number | null }) {
  const r = reach(obj);
  const pts: { x: number; z: number; dist: number }[] = [];
  for (let x = -d.width / 2 + r; x <= d.width / 2 - r; x += 0.25)
    for (let z = -d.depth / 2 + r; z <= d.depth / 2 - r; z += 0.25) pts.push({ x, z, dist: Math.hypot(x, z) });
  pts.sort((a, b) => a.dist - b.dist);
  const ok = pts.find((p) => d.objects.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > reach(o) + r));
  return ok ? { x: Math.round(ok.x * 10) / 10, z: Math.round(ok.z * 10) / 10 } : { x: 0, z: 0 };
}

function nextTableNumber(objects: FloorObjectData[]) {
  const nums = objects.map((o) => Number(normalizeTableNumber(o.tableNumber))).filter((n) => Number.isInteger(n));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

export function FloorEditor({
  draft,
  selectedId,
  error,
  onChange,
  onSelect,
  onSample,
  pending,
}: {
  draft: Draft;
  selectedId: string | null;
  error: string | null;
  onChange: (fn: (d: Draft) => Draft) => void;
  onSelect: (id: string | null) => void;
  onSample: () => void;
  pending: boolean;
}) {
  const selected = draft.objects.find((o) => o.id === selectedId) ?? null;

  const patch = (id: string, p: Partial<FloorObjectData>) =>
    onChange((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
  const remove = (id: string) => {
    onChange((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== id) }));
    onSelect(null);
  };
  const rotate = (id: string, by: number) =>
    onChange((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, rotation: (((o.rotation + by) % 360) + 360) % 360 } : o)) }));

  function add(obj: Omit<FloorObjectData, "id" | "x" | "z" | "rotation">) {
    const id = tempId();
    onChange((d) => {
      const spot = freeSpot(d, obj);
      const tableNumber = obj.kind === "TABLE" ? nextTableNumber(d.objects) : null;
      const label = obj.kind === "TABLE" ? `Table ${tableNumber}` : obj.label;
      return { ...d, objects: [...d.objects, { ...obj, id, label, tableNumber, ...spot, rotation: 0 }] };
    });
    onSelect(id);
  }

  function duplicate(o: FloorObjectData) {
    const id = tempId();
    onChange((d) => {
      const tableNumber = o.kind === "TABLE" ? nextTableNumber(d.objects) : null;
      const x = Math.min(d.width / 2, o.x + 1.2);
      return {
        ...d,
        objects: [...d.objects, { ...o, id, tableNumber, label: o.kind === "TABLE" ? `Table ${tableNumber}` : o.label, x }],
      };
    });
    onSelect(id);
  }

  // Keyboard shortcuts while editing (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!selectedId) return;
      const step = e.shiftKey ? 0.5 : 0.1;
      const nudge = (dx: number, dz: number) =>
        onChange((d) => ({
          ...d,
          objects: d.objects.map((o) =>
            o.id === selectedId
              ? {
                  ...o,
                  x: Math.round(Math.max(-d.width / 2, Math.min(d.width / 2, o.x + dx)) * 100) / 100,
                  z: Math.round(Math.max(-d.depth / 2, Math.min(d.depth / 2, o.z + dz)) * 100) / 100,
                }
              : o,
          ),
        }));
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selectedId);
      } else if (e.key === "r" || e.key === "R") rotate(selectedId, e.shiftKey ? -90 : 90);
      else if (e.key === "Escape") onSelect(null);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const [dx, dz] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        nudge(dx, dz);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Client-side hints (the server validates again on save).
  const dupes = new Map<string, string[]>();
  for (const o of draft.objects) {
    if (o.kind !== "TABLE") continue;
    const k = normalizeTableNumber(o.tableNumber);
    if (k) dupes.set(k, [...(dupes.get(k) ?? []), o.label]);
  }
  const duplicateNumbers = [...dupes.entries()].filter(([, labels]) => labels.length > 1);
  const missingNumbers = draft.objects.filter((o) => o.kind === "TABLE" && !normalizeTableNumber(o.tableNumber));
  const num = (v: string, fallback: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <Panel>
      <PanelHeader title="Edit layout" actions={<span className="tabular text-[12px] text-muted">{draft.objects.length} objects</span>} />

      <div className="space-y-2 border-b border-line px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Add table</p>
        <div className="grid grid-cols-4 gap-1.5">
          {ADD_TABLES.map((t) => (
            <Button key={t.label} size="sm" onClick={() => add({ kind: "TABLE", label: "Table", seats: t.seats, shape: t.shape, width: t.width, depth: t.depth, tableNumber: null })}>
              {t.label}
            </Button>
          ))}
        </div>
        <p className="pt-1 text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Add fixture</p>
        <div className="flex flex-wrap gap-1.5">
          {ADD_FIXTURES.map((k) => (
            <Button key={k} size="sm" onClick={() => add({ ...KIND_DEFAULTS[k], tableNumber: null })}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-b border-line px-4 py-3">
        {(error || duplicateNumbers.length > 0 || missingNumbers.length > 0) && (
          <div className="space-y-2">
            <FormError message={error} />
            {duplicateNumbers.map(([k, labels]) => (
              <p key={k} className="text-[12px] text-danger">
                Table number {k} is used by {labels.join(" and ")}.
              </p>
            ))}
            {missingNumbers.map((o) => (
              <p key={o.id} className="text-[12px] text-danger">
                {o.label} needs a table number.
              </p>
            ))}
          </div>
        )}

        {!selected ? (
          <p className="text-[13px] text-muted">Click an object in the 3D view to edit it, or drag it to move it.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">{KIND_LABEL[selected.kind]}</p>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="size-7" title="Rotate 90° (R)" aria-label="Rotate 90 degrees" onClick={() => rotate(selected.id, 90)}>
                  <RotateCw />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" title="Duplicate" aria-label="Duplicate" onClick={() => duplicate(selected)}>
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-danger hover:bg-danger-soft"
                  title="Delete (Del)"
                  aria-label="Delete"
                  onClick={() => remove(selected.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <Field label="Label" htmlFor="fo-label">
              <Input id="fo-label" value={selected.label} maxLength={40} onChange={(e) => patch(selected.id, { label: e.target.value })} />
            </Field>

            {selected.kind === "TABLE" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table number" htmlFor="fo-num" hint="Matches the table no. on orders">
                  <Input
                    id="fo-num"
                    value={selected.tableNumber ?? ""}
                    maxLength={10}
                    onChange={(e) => {
                      const v = e.target.value;
                      const auto = /^Table \S*$/.test(selected.label) || selected.label === "Table";
                      patch(selected.id, { tableNumber: v, ...(auto ? { label: `Table ${v}`.trim() } : {}) });
                    }}
                  />
                </Field>
                <Field label="Seats" htmlFor="fo-seats">
                  <Input
                    id="fo-seats"
                    type="number"
                    min={1}
                    max={20}
                    value={selected.seats ?? ""}
                    onChange={(e) => patch(selected.id, { seats: Math.max(1, Math.min(20, Math.round(num(e.target.value, selected.seats ?? 1)))) })}
                  />
                </Field>
              </div>
            )}

            {selected.kind === "TABLE" && (
              <Field label="Shape" htmlFor="fo-shape">
                <Select
                  id="fo-shape"
                  value={selected.shape}
                  onChange={(e) => {
                    const shape = e.target.value as "RECT" | "ROUND";
                    const size = Math.max(selected.width, selected.depth);
                    patch(selected.id, shape === "ROUND" ? { shape, width: size, depth: size } : { shape });
                  }}
                >
                  <option value="RECT">Square / rectangle</option>
                  <option value="ROUND">Round</option>
                </Select>
              </Field>
            )}

            {selected.shape === "ROUND" && selected.kind === "TABLE" ? (
              <Field label="Diameter (m)" htmlFor="fo-diam">
                <Input
                  id="fo-diam"
                  type="number"
                  step={0.1}
                  min={0.4}
                  max={4}
                  value={selected.width}
                  onChange={(e) => {
                    const v = Math.max(0.4, Math.min(4, num(e.target.value, selected.width)));
                    patch(selected.id, { width: v, depth: v });
                  }}
                />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width (m)" htmlFor="fo-w">
                  <Input
                    id="fo-w"
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={30}
                    value={selected.width}
                    onChange={(e) => patch(selected.id, { width: Math.max(0.1, Math.min(30, num(e.target.value, selected.width))) })}
                  />
                </Field>
                <Field label="Depth (m)" htmlFor="fo-d">
                  <Input
                    id="fo-d"
                    type="number"
                    step={0.1}
                    min={0.05}
                    max={30}
                    value={selected.depth}
                    onChange={(e) => patch(selected.id, { depth: Math.max(0.05, Math.min(30, num(e.target.value, selected.depth))) })}
                  />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="X (m)" htmlFor="fo-x">
                <Input
                  id="fo-x"
                  type="number"
                  step={0.1}
                  value={selected.x}
                  onChange={(e) => patch(selected.id, { x: Math.max(-draft.width / 2, Math.min(draft.width / 2, num(e.target.value, selected.x))) })}
                />
              </Field>
              <Field label="Z (m)" htmlFor="fo-z">
                <Input
                  id="fo-z"
                  type="number"
                  step={0.1}
                  value={selected.z}
                  onChange={(e) => patch(selected.id, { z: Math.max(-draft.depth / 2, Math.min(draft.depth / 2, num(e.target.value, selected.z))) })}
                />
              </Field>
              <Field label="Rotation" htmlFor="fo-rot">
                <Select id="fo-rot" value={String(selected.rotation)} onChange={(e) => patch(selected.id, { rotation: Number(e.target.value) })}>
                  {[...new Set([0, 45, 90, 135, 180, 225, 270, 315, selected.rotation])]
                    .sort((a, b) => a - b)
                    .map((r) => (
                      <option key={r} value={r}>
                        {r}°
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 border-b border-line px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Floor size</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (m)" htmlFor="floor-w">
            <Input
              id="floor-w"
              type="number"
              step={0.5}
              min={3}
              max={100}
              value={draft.width}
              onChange={(e) => onChange((d) => ({ ...d, width: Math.max(3, Math.min(100, num(e.target.value, d.width))) }))}
            />
          </Field>
          <Field label="Depth (m)" htmlFor="floor-d">
            <Input
              id="floor-d"
              type="number"
              step={0.5}
              min={3}
              max={100}
              value={draft.depth}
              onChange={(e) => onChange((d) => ({ ...d, depth: Math.max(3, Math.min(100, num(e.target.value, d.depth))) }))}
            />
          </Field>
        </div>
        <p className="text-[11px] text-muted">The entrance makes a gap in the outer wall when placed at an edge.</p>
      </div>

      <div className="px-4 py-3">
        <Button variant="danger-outline" size="sm" onClick={onSample} disabled={pending}>
          Replace with sample layout
        </Button>
      </div>
    </Panel>
  );
}
