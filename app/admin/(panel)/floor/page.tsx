import type { Metadata } from "next";
import { getFloorData } from "@/lib/services/floor";
import { normalizeTableNumber } from "@/lib/floor";
import { requireContext } from "@/lib/tenant";
import { PageHeader } from "@/components/ui/misc";
import { ChooseBranch } from "../branch-switcher";
import { FloorView } from "./floor-view";

export const metadata: Metadata = { title: "Floor" };

/**
 * /admin/floor?table=5 opens with table 5 selected and the camera on it (linked from Orders).
 * The layout is shared by all branches; the live orders are the selected branch's.
 */
export default async function FloorPage({ searchParams }: PageProps<"/admin/floor">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  if (!ctx.branch) {
    return (
      <>
        <PageHeader title="Floor" description="The live floor shows one branch at a time." />
        <ChooseBranch branches={ctx.branches} title="Choose a branch" description="All branches share the same floor plan; each shows its own open orders." />
      </>
    );
  }
  const focusTable = typeof sp.table === "string" ? normalizeTableNumber(sp.table) : null;
  const data = await getFloorData(ctx.merchant.id, ctx.branch.id);
  const multi = ctx.branches.length > 1;
  return (
    <FloorView
      key={`${ctx.branch.id}:${focusTable ?? "floor"}`}
      data={data}
      focusTable={focusTable}
      branchName={multi ? ctx.branch.name : null}
      sharedPlan={multi}
    />
  );
}
