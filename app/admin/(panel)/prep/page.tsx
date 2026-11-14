import type { Metadata } from "next";
import { getPrepSheet } from "@/lib/services/prep";
import { addDays, localDate } from "@/lib/time";
import { isoDate } from "@/lib/validation";
import { requireContext } from "@/lib/tenant";
import { PageHeader } from "@/components/ui/misc";
import { ChooseBranch } from "../branch-switcher";
import { PrepSheet } from "./prep-sheet";

export const metadata: Metadata = { title: "Today's prep" };

export default async function PrepPage({ searchParams }: PageProps<"/admin/prep">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  if (!ctx.branch) {
    return (
      <>
        <PageHeader title="Today's prep" description="Each branch records its own morning prep." />
        <ChooseBranch branches={ctx.branches} title="Choose a branch" description="Prep numbers, sales and sold-out times are kept per branch." />
      </>
    );
  }
  const tz = ctx.settings.timezone;
  const today = localDate(new Date(), tz);
  const requested = typeof sp.date === "string" && isoDate.safeParse(sp.date).success ? sp.date : today;
  // Allow planning for tomorrow, never further ahead.
  const date = requested > addDays(today, 1) ? today : requested;

  const sheet = await getPrepSheet(ctx.branch.id, date);

  return (
    <>
      <PageHeader
        title={ctx.branches.length > 1 ? `Today's prep · ${ctx.branch.name}` : "Today's prep"}
        description="Record how many plates were prepared this morning. Leave blank if not prepared or unknown."
      />
      <PrepSheet key={`${ctx.branch.id}:${date}`} branchId={ctx.branch.id} date={date} today={today} timezone={sheet.timezone} rows={sheet.rows} />
    </>
  );
}
