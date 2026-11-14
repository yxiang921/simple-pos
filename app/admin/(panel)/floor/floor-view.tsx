"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { LayoutGrid, Loader2, Pencil, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { LiveIndicator } from "@/components/live-updates";
import { formatOrderNumber, formatRM, ORDER_STATUS_LABEL } from "@/lib/format";
import {
  computeFloorStatus,
  formatAge,
  heatColor,
  KIND_LABEL,
  normalizeTableNumber,
  type FloorObjectData,
  type FloorOrder,
  type ObjectStatus,
} from "@/lib/floor";
import type { FloorData } from "@/lib/services/floor";
import { createSampleLayoutAction, saveFloorLayoutAction } from "../../_actions/floor";
import { updateOrderStatusAction } from "../../_actions/orders";
import type { SceneApi } from "./floor-scene";
import { FloorEditor, type Draft } from "./floor-editor";

const FloorScene = dynamic(() => import("./floor-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading 3D view…
    </div>
  ),
});

const TOOLS = [
  { action: "in", label: "Zoom in", icon: ZoomIn },
  { action: "out", label: "Zoom out", icon: ZoomOut },
  { action: "reset", label: "Reset view", icon: RotateCcw },
  { action: "top", label: "Top view", icon: LayoutGrid },
] as const;

const NEXT_STEP: Record<FloorOrder["status"], { status: "PREPARING" | "READY" | "COMPLETED"; label: string }> = {
  PENDING: { status: "PREPARING", label: "Start" },
  PREPARING: { status: "READY", label: "Ready" },
  READY: { status: "COMPLETED", label: "Complete" },
};

export function FloorView({
  data,
  focusTable = null,
  branchName = null,
  sharedPlan = false,
}: {
  data: FloorData;
  focusTable?: string | null;
  /** Shown in the title when the merchant has several branches. */
  branchName?: string | null;
  /** The plan is shared by several branches: say so in the editor. */
  sharedPlan?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const apiRef = useRef<SceneApi | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<{ basedOn: FloorData; draft: Draft } | null>(null);
  // Opened from an order's table link: start with that table selected (the scene flies to it).
  const [initialFocusId] = useState(
    () => data.objects.find((o) => o.kind === "TABLE" && normalizeTableNumber(o.tableNumber) === focusTable)?.id ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialFocusId);
  const [glError, setGlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.parse(data.serverNow));
  const [pending, startTransition] = useTransition();

  // Server-corrected clock for the side panel (the 3D scene keeps its own).
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = Date.parse(data.serverNow) - Date.now();
  }, [data.serverNow]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 5000);
    return () => clearInterval(id);
  }, []);

  // While editing show the draft; right after saving, show it until fresh data arrives.
  const optimistic = saved && saved.basedOn === data ? saved.draft : null;
  const source = mode === "edit" && draft ? draft : (optimistic ?? { width: data.floorWidth, depth: data.floorDepth, objects: data.objects });
  const { objects, width: floorWidth, depth: floorDepth } = source;

  const status = useMemo(
    () => computeFloorStatus(objects, data.orders, now, data.alertMinutes),
    [objects, data.orders, now, data.alertMinutes],
  );
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const updateDraft = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  }, []);
  const onMove = useCallback(
    (id: string, x: number, z: number) => updateDraft((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, x, z } : o)) })),
    [updateDraft],
  );
  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);
  const onError = useCallback((msg: string) => setGlError(msg), []);

  function startEdit(empty = false) {
    setDraft({ width: data.floorWidth, depth: data.floorDepth, objects: empty ? [] : data.objects.map((o) => ({ ...o })) });
    setDirty(empty);
    setSelectedId(null);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    if (dirty && !confirm("Discard your layout changes?")) return;
    setMode("view");
    setDraft(null);
    setDirty(false);
    setSelectedId(null);
    setError(null);
  }

  function save() {
    if (!draft) return;
    const snapshot = draft;
    startTransition(async () => {
      const res = await saveFloorLayoutAction({ floorWidth: snapshot.width, floorDepth: snapshot.depth, objects: snapshot.objects });
      if (res.ok) {
        toast("Floor plan saved");
        setSaved({ basedOn: data, draft: snapshot });
        setMode("view");
        setDraft(null);
        setDirty(false);
        setSelectedId(null);
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function applySample(replace: boolean) {
    if (replace && !confirm("Replace the whole floor plan with the sample café layout?")) return;
    startTransition(async () => {
      const res = await createSampleLayoutAction(replace);
      if (res.ok) {
        toast("Sample café layout created");
        setMode("view");
        setDraft(null);
        setDirty(false);
        setSelectedId(null);
        router.refresh();
      } else toast(res.error, "error");
    });
  }

  function runTool(action: (typeof TOOLS)[number]["action"]) {
    const api = apiRef.current;
    if (action === "in") api?.zoom(0.8);
    else if (action === "out") api?.zoom(1.25);
    else if (action === "reset") api?.reset();
    else api?.top();
  }

  function focus(id: string) {
    setSelectedId(id);
    apiRef.current?.focus(id);
  }

  return (
    <>
      <PageHeader
        title={branchName ? `Floor · ${branchName}` : "Floor"}
        description={
          mode === "edit"
            ? `Drag furniture to move it. Select an object to change its size, seats or table number.${sharedPlan ? " The layout is shared by all branches." : ""}`
            : `Live table status — green is free; yellow turns red as an order waits (fully red after ${data.alertMinutes} min).`
        }
        actions={
          mode === "edit" ? (
            <>
              <Button onClick={cancelEdit} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={pending} className="min-w-[110px]">
                {pending && <Loader2 className="animate-spin" />}
                Save layout
              </Button>
            </>
          ) : (
            objects.length > 0 && (
              <Button onClick={() => startEdit()}>
                <Pencil /> Edit layout
              </Button>
            )
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="floor-stage card relative h-[calc(100dvh-200px)] min-h-[460px] overflow-hidden rounded-[22px]">
          {glError ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-[14px] font-medium">The 3D view isn&apos;t available on this device</p>
              <p className="mt-1 max-w-sm text-[13px] text-muted">
                {glError}. Table status is still listed on the right. Try another browser or turn on hardware acceleration.
              </p>
            </div>
          ) : (
            <FloorScene
              objects={objects}
              floorWidth={floorWidth}
              floorDepth={floorDepth}
              orders={data.orders}
              alertMinutes={data.alertMinutes}
              serverNow={data.serverNow}
              mode={mode}
              selectedId={selectedId}
              onSelect={onSelect}
              onMove={onMove}
              onError={onError}
              tooltipRef={tooltipRef}
              apiRef={apiRef}
              initialFocusId={initialFocusId}
            />
          )}

          {!glError && (
            <div className="glass-strong shadow-pop absolute left-3 top-3 z-10 flex flex-col gap-0.5 rounded-[14px] border border-line p-1">
              {TOOLS.map(({ action, label, icon: Icon }) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => runTool(action)}
                  title={label}
                  aria-label={label}
                  className="press flex size-8 items-center justify-center rounded-[10px] text-ink hover:bg-hover hover:text-primary"
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          )}

          {mode === "edit" && !glError && (
            <div className="glass pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-line px-3 py-1.5 text-[12px] text-muted">
              Drag to move · <kbd className="font-sans font-semibold text-ink">R</kbd> rotate · <kbd className="font-sans font-semibold text-ink">Del</kbd> delete ·
              arrows nudge · right-drag pans
            </div>
          )}

          {mode === "view" && !glError && objects.length > 0 && (
            <div className="glass pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-full border border-line px-3 py-1.5 text-[12px] text-muted md:block">
              Drag to rotate · scroll to zoom · right-drag to pan · click a table for details
            </div>
          )}

          {/* Positioned by the 3D engine above the selected object. */}
          <div ref={tooltipRef} className="pointer-events-none invisible absolute left-0 top-0 z-20">
            {mode === "view" && selected && (
              <ObjectTooltip
                object={selected}
                status={status.byObject.get(selected.id)}
                now={now}
                alertMinutes={data.alertMinutes}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>

          {mode === "view" && objects.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/50 backdrop-blur-sm">
              <div className="glass-strong shadow-pop animate-pop max-w-sm rounded-[22px] border border-line p-6 text-center">
                <p className="text-[15px] font-semibold">No floor plan yet</p>
                <p className="mt-1 text-[13px] text-muted">
                  Start from a sample café layout (12 tables, counter, kitchen and pickup point) and adjust it, or draw your own.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="primary" onClick={() => applySample(false)} disabled={pending}>
                    {pending && <Loader2 className="animate-spin" />}
                    Use sample layout
                  </Button>
                  <Button onClick={() => startEdit(true)} disabled={pending}>
                    Draw my own
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="min-w-0">
          {mode === "edit" && draft ? (
            <FloorEditor
              draft={draft}
              selectedId={selectedId}
              error={error}
              onChange={updateDraft}
              onSelect={setSelectedId}
              onSample={() => applySample(true)}
              pending={pending}
            />
          ) : (
            <LivePanel status={status} objects={objects} alertMinutes={data.alertMinutes} onFocus={focus} />
          )}
        </aside>
      </div>
    </>
  );
}

// ─── live panel ────────────────────────────────────────────────────────

function LivePanel({
  status,
  objects,
  alertMinutes,
  onFocus,
}: {
  status: ReturnType<typeof computeFloorStatus>;
  objects: FloorObjectData[];
  alertMinutes: number;
  onFocus: (id: string) => void;
}) {
  const waiting = objects
    .filter((o) => o.kind === "TABLE")
    .map((o) => ({ o, s: status.byObject.get(o.id)! }))
    .filter((x) => x.s?.heat !== null && x.s?.heat !== undefined)
    .sort((a, b) => (b.s.oldestMs ?? 0) - (a.s.oldestMs ?? 0));
  const pass = objects.find((o) => o.kind === "PASS");
  const free = status.tables - status.occupied;

  return (
    <Panel>
      <PanelHeader title="Live status" actions={<LiveIndicator />} />
      <div className="grid grid-cols-3 border-b border-line">
        {[
          { label: "Free", value: free, cls: "text-ink" },
          { label: "Waiting", value: status.occupied - status.overdue, cls: "text-ink" },
          { label: "Overdue", value: status.overdue, cls: status.overdue ? "text-danger" : "text-ink" },
        ].map((t) => (
          <div key={t.label} className="border-r border-line px-3 py-2.5 last:border-r-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-muted">{t.label}</p>
            <p className={clsx("tabular mt-0.5 text-[20px] font-semibold leading-tight", t.cls)}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="inline-block size-3 rounded-full" style={{ background: heatColor(null) }} /> Free
          <span
            className="ml-3 inline-block h-3 flex-1 rounded-full"
            style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }}
          />
        </div>
        <div className="mt-1 flex justify-between pl-[62px] text-[11px] text-muted tabular">
          <span>new order</span>
          <span>{alertMinutes} min+</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Red tables pulse once an order has waited {alertMinutes} minutes — it may have been missed by the kitchen. Change the time in
          Settings.
        </p>
      </div>

      <div className="border-b border-line">
        <p className="px-4 pb-1 pt-3 text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Waiting tables</p>
        {waiting.length === 0 ? (
          <p className="px-4 pb-3 text-[13px] text-muted">{status.tables ? "All tables are free." : "No tables on the floor plan."}</p>
        ) : (
          <ul className="pb-1.5">
            {waiting.map(({ o, s }) => {
              const overdue = (s.heat ?? 0) >= 1;
              const oldest = s.orders[0];
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => onFocus(o.id)} className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-hover">
                    <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: heatColor(s.heat) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{o.label}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {s.orders.length > 1 ? `${s.orders.length} orders · ` : ""}
                        {formatOrderNumber(oldest.orderNumber)} {ORDER_STATUS_LABEL[oldest.status].toLowerCase()}
                      </span>
                    </span>
                    <span className={clsx("tabular text-[13px]", overdue ? "font-semibold text-danger" : "text-muted")}>
                      {formatAge(s.oldestMs ?? 0)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-b border-line px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Pickup (no table)</p>
        {status.takeaway.orders.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">No takeaway orders waiting.</p>
        ) : (
          <button
            type="button"
            disabled={!pass}
            onClick={() => pass && onFocus(pass.id)}
            className="mt-1 flex w-full items-center gap-2.5 text-left disabled:cursor-default"
          >
            <span className="inline-block size-3 rounded-full" style={{ background: heatColor(status.takeaway.heat) }} />
            <span className="flex-1 text-[13px]">
              {status.takeaway.orders.length} order{status.takeaway.orders.length === 1 ? "" : "s"} waiting
            </span>
            <span className={clsx("tabular text-[13px]", (status.takeaway.heat ?? 0) >= 1 ? "font-semibold text-danger" : "text-muted")}>
              {formatAge(status.takeaway.oldestMs ?? 0)}
            </span>
          </button>
        )}
      </div>

      {status.unknown.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted">Not on the floor plan</p>
          <ul className="mt-1 space-y-1">
            {status.unknown.map((u) => (
              <li key={u.tableNumber} className="flex items-center justify-between gap-2 text-[13px]">
                <Link href={`/admin/orders?status=ACTIVE&table=${encodeURIComponent(u.tableNumber)}`} className="hover:text-primary hover:underline">
                  Table {u.tableNumber} · {u.orders.length} order{u.orders.length === 1 ? "" : "s"}
                </Link>
                <span className="tabular text-muted">{formatAge(u.oldestMs)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">Add a table with this number in Edit layout to see it on the floor.</p>
        </div>
      )}
    </Panel>
  );
}

// ─── tooltip ───────────────────────────────────────────────────────────

function ObjectTooltip({
  object,
  status,
  now,
  alertMinutes,
  onClose,
}: {
  object: FloorObjectData;
  status: ObjectStatus | undefined;
  now: number;
  alertMinutes: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isTable = object.kind === "TABLE";
  const isPass = object.kind === "PASS";
  const orders = status?.orders ?? [];
  const heat = status?.heat ?? null;

  function advance(o: FloorOrder) {
    const next = NEXT_STEP[o.status];
    setBusy(o.id);
    startTransition(async () => {
      const res = await updateOrderStatusAction(o.id, next.status);
      setBusy(null);
      if (res.ok) {
        toast(`${formatOrderNumber(o.orderNumber)} → ${ORDER_STATUS_LABEL[next.status].toLowerCase()}`);
        router.refresh();
      } else toast(res.error, "error");
    });
  }

  return (
    <div>
      <div className="glass-strong shadow-pop animate-pop pointer-events-auto w-[310px] overflow-hidden rounded-[18px] border border-line text-left">
        <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{object.label}</p>
            <p className="text-[12px] text-muted">
              {isTable ? `Table ${object.tableNumber} · ${object.seats} seat${object.seats === 1 ? "" : "s"}` : isPass ? "Orders without a table number" : KIND_LABEL[object.kind]}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(isTable || isPass) &&
              (heat === null ? (
                isTable ? <Badge tone="green">Free</Badge> : <Badge tone="outline">Empty</Badge>
              ) : heat >= 1 ? (
                <Badge tone="danger">Overdue {formatAge(status!.oldestMs ?? 0)}</Badge>
              ) : (
                <Badge tone="warning">Waiting {formatAge(status!.oldestMs ?? 0)}</Badge>
              ))}
            <button type="button" onClick={onClose} aria-label="Close" className="press flex size-6 items-center justify-center rounded-full bg-fill text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        </div>
        {(isTable || isPass) && (
          <div className="max-h-[260px] overflow-y-auto">
            {orders.length === 0 ? (
              <p className="px-3.5 py-3 text-[13px] text-muted">No open orders.</p>
            ) : (
              <ul className="divide-y divide-line">
                {orders.map((o) => {
                  const age = now - Date.parse(o.createdAt);
                  const late = age >= alertMinutes * 60_000;
                  return (
                    <li key={o.id} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate">
                          <span className="tabular font-semibold">{formatOrderNumber(o.orderNumber)}</span> · {o.customerName}
                        </span>
                        <span className={clsx("tabular shrink-0 text-[12px]", late ? "font-semibold text-danger" : "text-muted")}>
                          {ORDER_STATUS_LABEL[o.status]} · {formatAge(age)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                        {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="tabular text-[12px] text-muted">
                          {formatRM(o.totalAmount)} · {o.paymentStatus === "PAID" ? "paid" : "unpaid"}
                        </span>
                        <span className="flex gap-1">
                          <Link
                            href={`/admin/orders?status=ALL&q=${o.orderNumber}`}
                            className="press inline-flex h-7 items-center rounded-full border border-line-strong px-3 text-[12px] hover:bg-hover"
                          >
                            Details
                          </Link>
                          <Button size="sm" variant="primary" onClick={() => advance(o)} disabled={busy !== null} className="min-w-[70px]">
                            {busy === o.id ? <Loader2 className="animate-spin" /> : NEXT_STEP[o.status].label}
                          </Button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {(isTable || isPass) && (
          <div className="flex justify-end border-t border-line px-3.5 py-2">
            <Link
              href={isTable ? `/admin/orders?table=${encodeURIComponent(object.tableNumber ?? "")}` : "/admin/orders?status=ACTIVE&table=none"}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              {isTable ? "All orders for this table →" : "All takeaway orders →"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
