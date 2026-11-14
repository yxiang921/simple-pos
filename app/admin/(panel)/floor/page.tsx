import type { Metadata } from "next";
import { getFloorData } from "@/lib/services/floor";
import { FloorView } from "./floor-view";

export const metadata: Metadata = { title: "Floor" };

export default async function FloorPage() {
  const data = await getFloorData();
  return <FloorView data={data} />;
}
