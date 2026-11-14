import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/tenant";
import { knownSuppliers } from "@/lib/services/stock-in";
import { localDate } from "@/lib/time";
import { COST_UNIT, type BaseUnitCode } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { StockInForm, type StockInIngredient } from "./stock-in-form";

export const metadata: Metadata = { title: "New stock in" };

export default async function NewStockInPage() {
  const ctx = await requireContext();
  const [ingredients, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { merchantId: ctx.merchant.id, isActive: true },
      orderBy: { name: "asc" },
      include: { stocks: { select: { branchId: true, currentStock: true, lowStockThreshold: true } } },
    }),
    knownSuppliers(ctx.merchant.id),
  ]);
  const options: StockInIngredient[] = ingredients.map((i) => {
    const unit = i.unit as BaseUnitCode;
    return {
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit,
      // Last known cost, per kg / L / pcs (for the cost hint).
      costPerDisplay: i.costPerUnit ? i.costPerUnit.mul(COST_UNIT[unit].factor).toDecimalPlaces(2).toString() : null,
      stock: Object.fromEntries(
        i.stocks.map((s) => [s.branchId, { current: s.currentStock.toString(), low: s.lowStockThreshold.toString() }]),
      ) as Record<string, { current: string; low: string }>,
    };
  });

  return (
    <>
      <Link href="/admin/inventory/stock-in" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Stock in
      </Link>
      <PageHeader title="New stock in" description="Record a delivery: add every ingredient that arrived, with quantities and (optionally) what you paid." />
      <StockInForm
        ingredients={options}
        suppliers={suppliers}
        branches={ctx.branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
        currentBranch={ctx.branch?.id ?? null}
        hqId={ctx.hq.id}
        today={localDate(new Date(), ctx.settings.timezone)}
      />
    </>
  );
}
