import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Old single-shop guest links (/order, /order/cart, /order?table=5 on printed QR
 * codes) go to the first merchant's headquarters, keeping the rest of the path
 * and the query. New links look like /s/<merchant>/<branch>.
 */
export default async function LegacyOrderRedirect({ params, searchParams }: PageProps<"/order/[[...rest]]">) {
  const { rest = [] } = await params;
  const sp = await searchParams;
  const hq = await prisma.branch.findFirst({
    where: { isHeadquarters: true, isActive: true },
    orderBy: { merchant: { createdAt: "asc" } },
    select: { slug: true, merchant: { select: { slug: true } } },
  });
  if (!hq) redirect("/");
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") query.set(k, v);
  const tail = rest.map(encodeURIComponent).join("/");
  redirect(`/s/${hq.merchant.slug}/${hq.slug}${tail ? `/${tail}` : ""}${query.size ? `?${query}` : ""}`);
}
