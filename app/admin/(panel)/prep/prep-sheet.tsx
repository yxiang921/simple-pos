"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Checkbox, FormError, Input } from "@/components/ui/form";
import { Badge, EmptyState, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { PrepRow } from "@/lib/services/prep";
import { savePrepAction } from "../../_actions/prep";

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function PrepSheet({
  branchId,
  date,
  today,
  timezone,
  rows,
}: {
  branchId: string;
  date: string;
  today: string;
  timezone: string;
  rows: PrepRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.menuItemId, r.platesPrepared === null ? "" : String(r.platesPrepared)])),
  );
  const [aheadOnly, setAheadOnly] = useState(rows.some((r) => r.isPreparedAhead === true));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => (aheadOnly ? rows.filter((r) => r.isPreparedAhead !== false) : rows), [rows, aheadOnly]);
  const dirty = rows.some((r) => (r.platesPrepared === null ? "" : String(r.platesPrepared)) !== values[r.menuItemId]);
  const timeFmt = new Intl.DateTimeFormat("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone });
  const label = new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

  function go(d: string) {
    if (dirty && !confirm("Discard unsaved prep numbers?")) return;
    router.push(`/admin/prep?date=${d}`);
  }

  function save() {
    setError(null);
    const changed = rows
      .filter((r) => (r.platesPrepared === null ? "" : String(r.platesPrepared)) !== values[r.menuItemId])
      .map((r) => ({ menuItemId: r.menuItemId, plates: values[r.menuItemId].trim() === "" ? null : values[r.menuItemId].trim() }));
    startTransition(async () => {
      const res = await savePrepAction(branchId, { date, entries: changed });
      if (res.ok) {
        toast(`Prep saved for ${label}`);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" onClick={() => go(shiftDate(date, -1))} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            max={shiftDate(today, 1)}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="h-8 w-40"
            aria-label="Date"
          />
          <Button size="icon" onClick={() => go(shiftDate(date, 1))} disabled={date >= shiftDate(today, 1)} aria-label="Next day">
            <ChevronRight />
          </Button>
          <span className="ml-1 text-[13px] text-muted">
            {label}
            {date === today && <span className="ml-1.5 font-medium text-primary">· Today</span>}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Checkbox label="Hide made-to-order items" checked={aheadOnly} onChange={(e) => setAheadOnly(e.target.checked)} />
          <Button variant="primary" onClick={save} disabled={pending || !dirty} className="min-w-[96px]">
            {pending && <Loader2 className="animate-spin" />}
            Save prep
          </Button>
        </div>
      </div>

      <FormError message={error} />

      <Panel className={error ? "mt-3" : undefined}>
        {visible.length === 0 ? (
          <EmptyState title="No menu items" description="Mark dishes as 'Prepared ahead' in the menu editor to see them here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH>Type</TH>
                <TH className="w-36">Plates prepared</TH>
                <TH className="text-right">Sold</TH>
                <TH className="text-right">Left over</TH>
                <TH>Sold out at</TH>
              </tr>
            </THead>
            <tbody>
              {visible.map((r) => {
                const v = values[r.menuItemId];
                const prepared = v.trim() === "" ? null : Number(v);
                const left = prepared === null || Number.isNaN(prepared) ? null : prepared - r.sold;
                return (
                  <TR key={r.menuItemId}>
                    <TD className="font-medium">
                      {r.name}
                      {!r.isAvailable && <span className="ml-1.5 text-[12px] font-normal text-muted">(off menu)</span>}
                    </TD>
                    <TD className="text-muted">{r.category}</TD>
                    <TD>
                      {r.isPreparedAhead === true ? (
                        <Badge tone="green">Prepared ahead</Badge>
                      ) : r.isPreparedAhead === false ? (
                        <span className="text-[12px] text-muted">Made to order</span>
                      ) : (
                        <span className="text-[12px] text-subtle">Not set</span>
                      )}
                    </TD>
                    <TD>
                      <Input
                        inputMode="numeric"
                        value={v}
                        onChange={(e) => setValues((s) => ({ ...s, [r.menuItemId]: e.target.value.replace(/[^\d]/g, "") }))}
                        placeholder="—"
                        className="tabular h-8 w-24 text-right"
                        aria-label={`Plates prepared: ${r.name}`}
                      />
                    </TD>
                    <TD className="tabular text-right">{r.sold}</TD>
                    <TD
                      className={clsx(
                        "tabular text-right",
                        left !== null && left < 0 && "text-danger",
                        left !== null && left > 0 && "text-warning",
                      )}
                    >
                      {left === null ? <span className="text-subtle">—</span> : left}
                    </TD>
                    <TD className="tabular text-muted">{r.soldOutAt ? timeFmt.format(new Date(r.soldOutAt)) : "—"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <p className="mt-2 text-[12px] text-muted">
        Sold counts exclude cancelled orders. A sold-out time is recorded automatically when an item is switched off in
        Menu. Times shown in {timezone}.
      </p>
    </>
  );
}
