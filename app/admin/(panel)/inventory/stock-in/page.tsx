import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus, Receipt, Truck, Wallet } from "lucide-react";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { branchFilter, requireContext } from "@/lib/tenant";
import { dayRangeUtc, localDate } from "@/lib/time";
import { formatDateTime, formatRM } from "@/lib/format";
import { textParam } from "@/lib/params";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Pagination, readPaging } from "@/components/ui/pagination";
import { EmptyState, PageHeader, Panel, StatGrid, Table, TD, TH, THead, TR } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Stock in" };

export default async function StockInPage({ searchParams }: PageProps<"/admin/inventory/stock-in">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const overview = !ctx.branch;
  const q = textParam(sp.q);
  const { page: requestedPage, size } = readPaging(sp);
  const scope = branchFilter(ctx);
  const where: Prisma.StockReceiptWhereInput = {
    ...scope,
    ...(q
      ? {
          OR: [
            { supplier: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            ...(/^#?\d+$/.test(q) ? [{ receiptNumber: Number(q.replace("#", "")) }] : []),
          ],
        }
      : {}),
  };
  const tz = ctx.settings.timezone;
  const monthStart = dayRangeUtc(`${localDate(new Date(), tz).slice(0, 7)}-01`, tz).start;

  const [total, month] = await Promise.all([
    prisma.stockReceipt.count({ where }),
    prisma.stockReceipt.aggregate({ where: { ...scope, receivedAt: { gte: monthStart } }, _count: true, _sum: { totalCost: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(requestedPage, pages);
  const [receipts, suppliers] = await Promise.all([
    prisma.stockReceipt.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { receiptNumber: "desc" }],
      skip: (page - 1) * size,
      take: size,
      include: {
        branch: { select: { name: true } },
        lines: { select: { ingredient: { select: { name: true } } }, orderBy: { ingredient: { name: "asc" } } },
      },
    }),
    prisma.stockReceipt.groupBy({ by: ["supplier"], where: { ...scope, receivedAt: { gte: monthStart }, supplier: { not: "" } } }),
  ]);
  const href = ({ page: p = 1, size: z = size }: { page?: number; size?: number }) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (z !== 25) u.set("size", String(z));
    if (p > 1) u.set("page", String(p));
    return `/admin/inventory/stock-in?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Stock in"
        description={
          overview
            ? "Deliveries received at every branch. Each delivery adds its ingredients to that branch's stock."
            : `Deliveries received${ctx.branches.length > 1 ? ` at ${ctx.branch!.name}` : ""}. Each delivery adds its ingredients to stock in one step.`
        }
        actions={
          <ButtonLink href="/admin/inventory/stock-in/new" variant="primary">
            <PackagePlus /> New stock in
          </ButtonLink>
        }
      />

      <StatGrid
        className="lg:grid-cols-3"
        stats={[
          { label: "Deliveries this month", value: month._count.toLocaleString(), icon: <Truck />, tone: "brand" },
          {
            label: "Spent this month",
            value: formatRM((month._sum.totalCost ?? 0).toString()),
            sub: "Lines with a cost",
            icon: <Wallet />,
            tone: "success",
          },
          { label: "Suppliers this month", value: String(suppliers.length), icon: <Receipt />, tone: "info" },
        ]}
      />

      <form className="mb-3 flex flex-wrap gap-2" action="/admin/inventory/stock-in">
        <Input name="q" defaultValue={q} placeholder="Supplier, invoice or #number" className="h-8 w-64" aria-label="Search deliveries" />
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
        {q && (
          <Link href="/admin/inventory/stock-in" className={buttonClass("ghost")}>
            Clear
          </Link>
        )}
      </form>

      <Panel>
        {receipts.length === 0 ? (
          <EmptyState
            title={q ? "No matching deliveries" : "No deliveries yet"}
            description={q ? undefined : "Record a supplier delivery to add several ingredients to stock at once."}
            action={
              !q && (
                <ButtonLink href="/admin/inventory/stock-in/new" variant="primary">
                  <PackagePlus /> New stock in
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Delivery</TH>
                <TH>Received</TH>
                {overview && <TH>Branch</TH>}
                <TH>Supplier</TH>
                <TH>Items</TH>
                <TH className="text-right">Cost</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <tbody>
              {receipts.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/admin/inventory/stock-in/${r.id}`} className="tabular font-semibold text-primary hover:underline">
                      #{String(r.receiptNumber).padStart(4, "0")}
                    </Link>
                    {r.reference && <span className="block text-[12px] text-muted">{r.reference}</span>}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(r.receivedAt)}</TD>
                  {overview && <TD className="whitespace-nowrap text-muted">{r.branch.name}</TD>}
                  <TD className="max-w-[180px] truncate">{r.supplier || <span className="text-subtle">—</span>}</TD>
                  <TD className="max-w-[340px]">
                    <span className="line-clamp-2 text-[13px]">
                      <span className="tabular mr-1.5 inline-flex h-5 items-center rounded-full bg-primary-soft px-2 text-[11px] font-semibold text-primary">
                        {r.lines.length}
                      </span>
                      {r.lines.map((l) => l.ingredient.name).join(", ")}
                    </span>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">{r.totalCost ? formatRM(r.totalCost.toString()) : <span className="text-subtle">—</span>}</TD>
                  <TD className="max-w-[160px] truncate text-muted">{r.createdBy ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <Pagination page={page} size={size} total={total} noun="deliveries" action="/admin/inventory/stock-in" hidden={{ q: q || undefined }} href={href} />
    </>
  );
}
