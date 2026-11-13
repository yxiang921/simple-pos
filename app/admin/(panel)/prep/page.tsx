import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getPrepSheet } from "@/lib/services/prep";
import { addDays, DEFAULT_TZ, localDate } from "@/lib/time";
import { isoDate } from "@/lib/validation";
import { PageHeader } from "@/components/ui/misc";
import { PrepSheet } from "./prep-sheet";

export const metadata: Metadata = { title: "Today's prep" };

export default async function PrepPage({ searchParams }: PageProps<"/admin/prep">) {
  const sp = await searchParams;
  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { timezone: true } });
  const tz = settings?.timezone || DEFAULT_TZ;
  const today = localDate(new Date(), tz);
  const requested = typeof sp.date === "string" && isoDate.safeParse(sp.date).success ? sp.date : today;
  // Allow planning for tomorrow, never further ahead.
  const date = requested > addDays(today, 1) ? today : requested;

  const sheet = await getPrepSheet(date);

  return (
    <>
      <PageHeader
        title="Today's prep"
        description="Record how many plates were prepared this morning. Leave blank if not prepared or unknown."
      />
      <PrepSheet key={date} date={date} today={today} timezone={sheet.timezone} rows={sheet.rows} />
    </>
  );
}
