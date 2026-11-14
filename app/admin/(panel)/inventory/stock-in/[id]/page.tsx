import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/tenant";
import { COST_UNIT, formatDateTime, formatQty, formatRM, type BaseUnitCode } from "@/lib/format";
import { Badge, PageHeader, Panel, PanelHeader, Table, TD, TH, THead, TR } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Delivery" };

export default async function StockReceiptPage({ params }: PageProps<"/admin/inventory/stock-in/[id]">) {
  const { id } = await params;
  const ctx = await requireContext();
  const r = await prisma.stockReceipt.findFirst({
    where: { id, branch: { merchantId: ctx.merchant.id } },
    include: {
      branch: { select: { name: true } },
      lines: { include: { ingredient: { select: { name: true, unit: true, sku: true } } }, orderBy: { ingredient: { name: "asc" } } },
    },
  });
  if (!r) notFound();
  const number = `#${String(r.receiptNumber).padStart(4, "0")}`;

  return (
    <>
      <Link href="/admin/inventory/stock-in" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Stock in
      </Link>
      <PageHeader
        title={`Delivery ${number}`}
        description={`${r.supplier || "No supplier"}${r.reference ? ` · ${r.reference}` : ""} · received ${formatDateTime(r.receivedAt)} at ${r.branch.name}`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <PanelHeader title={`${r.lines.length} item${r.lines.length === 1 ? "" : "s"}`} />
          <Table>
            <THead>
              <tr>
                <TH>Ingredient</TH>
                <TH className="text-right">Quantity</TH>
                <TH className="text-right">Cost</TH>
                <TH className="text-right">Unit cost</TH>
                <TH className="text-right">Stock after</TH>
              </tr>
            </THead>
            <tbody>
              {r.lines.map((l) => {
                const unit = l.ingredient.unit as BaseUnitCode;
                const per = l.lineCost && l.quantityChange.gt(0) ? l.lineCost.div(l.quantityChange).mul(COST_UNIT[unit].factor) : null;
                return (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/admin/inventory/movements?ingredient=${l.ingredientId}`} className="font-medium hover:underline">
                        {l.ingredient.name}
                      </Link>
                      {l.ingredient.sku && <span className="block text-[12px] text-muted">{l.ingredient.sku}</span>}
                    </TD>
                    <TD className="tabular text-right font-medium text-success">+{formatQty(l.quantityChange.toString(), unit)}</TD>
                    <TD className="tabular text-right">{l.lineCost ? formatRM(l.lineCost.toString()) : <span className="text-subtle">—</span>}</TD>
                    <TD className="tabular text-right text-muted">{per ? `${formatRM(per.toFixed(2))}/${COST_UNIT[unit].value}` : "—"}</TD>
                    <TD className="tabular text-right text-muted">{formatQty(l.balanceAfter.toString(), unit)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Panel>
        <Panel className="h-fit">
          <PanelHeader title="Summary" />
          <dl className="divide-y divide-line text-[13px]">
            {[
              ["Delivery", number],
              ["Branch", r.branch.name],
              ["Supplier", r.supplier || "—"],
              ["Invoice / DO", r.reference || "—"],
              ["Received", formatDateTime(r.receivedAt)],
              ["Recorded by", r.createdBy ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-muted">Total cost</dt>
              <dd className="tabular text-[18px] font-semibold">{r.totalCost ? formatRM(r.totalCost.toString()) : <Badge tone="outline">Not entered</Badge>}</dd>
            </div>
          </dl>
          {r.note && <p className="border-t border-line px-5 py-3 text-[13px] text-muted">{r.note}</p>}
        </Panel>
      </div>
    </>
  );
}
