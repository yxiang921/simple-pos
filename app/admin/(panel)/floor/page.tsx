import type { Metadata } from "next";
import { getFloorData } from "@/lib/services/floor";
import { normalizeTableNumber } from "@/lib/floor";
import { FloorView } from "./floor-view";

export const metadata: Metadata = { title: "Floor" };

/** /admin/floor?table=5 opens with table 5 selected and the camera on it (linked from Orders). */
export default async function FloorPage({ searchParams }: PageProps<"/admin/floor">) {
  const sp = await searchParams;
  const focusTable = typeof sp.table === "string" ? normalizeTableNumber(sp.table) : null;
  const data = await getFloorData();
  return <FloorView key={focusTable ?? "floor"} data={data} focusTable={focusTable} />;
}
