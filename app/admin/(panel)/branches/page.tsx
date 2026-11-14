import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/tenant";
import { guestUrl, switchHref } from "@/lib/links";
import { formatDateTime } from "@/lib/format";
import { Badge, PageHeader, Panel, PanelHeader, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { BranchRowActions, BranchToolbar, CopyLink } from "./branch-dialogs";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const ctx = await requireContext();
  const ids = ctx.branches.map((b) => b.id);
  const [totals, open, last, menuOff] = await Promise.all([
    prisma.order.groupBy({ by: ["branchId"], where: { branchId: { in: ids }, status: { not: "CANCELLED" } }, _count: true, _sum: { totalAmount: true } }),
    prisma.order.groupBy({ by: ["branchId"], where: { branchId: { in: ids }, status: { in: ["PENDING", "PREPARING", "READY"] }, isSimulated: false }, _count: true }),
    prisma.order.groupBy({ by: ["branchId"], where: { branchId: { in: ids } }, _max: { createdAt: true } }),
    prisma.branchMenuItem.groupBy({ by: ["branchId"], where: { branchId: { in: ids }, isAvailable: false, menuItem: { isArchived: false } }, _count: true }),
  ]);
  const get = <T extends { branchId: string }>(rows: T[], id: string) => rows.find((r) => r.branchId === id);

  return (
    <>
      <PageHeader
        title="Branches"
        description="Every branch sells the same menu and shares the ingredient list, settings, floor plan and running costs. Orders, stock and prep are kept per branch."
        actions={<BranchToolbar />}
      />
      <Panel className="mb-5">
        <Table>
          <THead>
            <tr>
              <TH>Branch</TH>
              <TH>Guest ordering link</TH>
              <TH className="text-right">Orders</TH>
              <TH className="text-right">Sales</TH>
              <TH className="text-right">Open now</TH>
              <TH className="text-right">Items off</TH>
              <TH>Last order</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {ctx.branches.map((b) => {
              const url = guestUrl(ctx.merchant.slug, b.slug);
              const t = get(totals, b.id);
              return (
                <TR key={b.id} className={!b.isActive ? "text-muted" : undefined}>
                  <TD>
                    <a href={switchHref(b.id, "/admin/dashboard")} className="font-medium text-primary hover:underline">
                      {b.name}
                    </a>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {b.isHeadquarters && <Badge tone="green">HQ</Badge>}
                      {!b.isActive && <Badge tone="outline">Closed</Badge>}
                      {ctx.branch?.id === b.id && <Badge tone="outline">Selected</Badge>}
                    </span>
                    {b.address && <p className="max-w-[260px] truncate text-[12px] text-muted">{b.address}</p>}
                  </TD>
                  <TD>
                    <CopyLink path={url} disabled={!b.isActive} />
                  </TD>
                  <TD className="tabular text-right">{(t?._count ?? 0).toLocaleString()}</TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    RM {Number(t?._sum.totalAmount ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TD>
                  <TD className="tabular text-right">{get(open, b.id)?._count ?? 0}</TD>
                  <TD className="tabular text-right text-muted">{get(menuOff, b.id)?._count ?? 0}</TD>
                  <TD className="tabular whitespace-nowrap text-muted">
                    {get(last, b.id)?._max.createdAt ? formatDateTime(get(last, b.id)!._max.createdAt!) : "—"}
                  </TD>
                  <TD className="text-right">
                    <BranchRowActions branch={{ id: b.id, name: b.name, slug: b.slug, address: b.address, isActive: b.isActive, isHeadquarters: b.isHeadquarters }} />
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <Panel className="max-w-3xl">
        <PanelHeader title="How branches work" />
        <ul className="list-disc space-y-1.5 py-3 pl-9 pr-4 text-[13px] text-muted">
          <li>Use the branch selector at the top of every page to work on one branch, or choose All branches for the headquarters overview.</li>
          <li>Shared by all branches: menu, prices, recipes, categories, ingredient list, settings and opening hours, floor plan, running costs.</li>
          <li>Per branch: orders, ingredient stock and stock movements, today&apos;s prep, sold-out times, and Hide / Show of menu items.</li>
          <li>Each branch has its own guest link; put it (or a QR code of it) on the tables. Add <code className="text-ink">?table=5</code> for a table&apos;s QR code.</li>
          <li>Closing a branch stops guest ordering there; its history stays in the reports.</li>
        </ul>
      </Panel>
    </>
  );
}
