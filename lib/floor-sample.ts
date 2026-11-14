import type { FloorObjectData } from "./floor";

/**
 * Sample café floor (14 m × 10 m) used for new stores, `npm run db:seed` and
 * `npm run db:fill`. Tables 1–12 match orders by table number.
 * Coordinates: x to the right, z towards the entrance (front), metres from the centre.
 */
export const SAMPLE_FLOOR = { width: 14, depth: 10 };

type Obj = Omit<FloorObjectData, "id">;
const table = (n: number, x: number, z: number, seats: number, shape: "RECT" | "ROUND", width: number, depth: number, rotation = 0): Obj => ({
  kind: "TABLE",
  label: `Table ${n}`,
  tableNumber: String(n),
  seats,
  shape,
  x,
  z,
  width,
  depth,
  rotation,
});
const fixture = (kind: Obj["kind"], label: string, x: number, z: number, width: number, depth: number, rotation = 0): Obj => ({
  kind,
  label,
  tableNumber: null,
  seats: null,
  shape: kind === "PLANT" ? "ROUND" : "RECT",
  x,
  z,
  width,
  depth,
  rotation,
});

export const SAMPLE_LAYOUT: Obj[] = [
  // Back of house
  fixture("KITCHEN", "Kitchen", 4.5, -3.6, 4.6, 2.6),
  fixture("PASS", "Pickup point", 4.5, -1.85, 1.8, 0.55),
  fixture("COUNTER", "Counter", 0.4, -3.9, 3.2, 0.7),
  fixture("BAR", "Drinks bar", -2.6, -4.3, 2.2, 0.6),
  fixture("ENTRANCE", "Entrance", 0, 4.6, 1.8, 0.8),
  // Window row of 2-seaters
  table(1, -6.1, -3.0, 2, "RECT", 0.7, 0.7),
  table(2, -6.1, -1.0, 2, "RECT", 0.7, 0.7),
  table(3, -6.1, 1.0, 2, "RECT", 0.7, 0.7),
  table(4, -6.1, 3.0, 2, "RECT", 0.7, 0.7),
  // Main floor
  table(5, -3.6, -1.4, 4, "RECT", 0.9, 0.9),
  table(6, -1.2, -1.4, 4, "ROUND", 1.0, 1.0),
  table(7, -3.6, 1.3, 4, "RECT", 0.9, 0.9),
  table(8, -1.2, 1.3, 4, "ROUND", 1.0, 1.0),
  table(9, 1.5, 0.0, 6, "RECT", 1.8, 0.9),
  table(10, -3.6, 3.7, 4, "RECT", 1.2, 0.8),
  table(11, 4.3, 0.9, 2, "ROUND", 0.7, 0.7),
  table(12, 4.3, 3.0, 4, "RECT", 1.2, 0.8),
  // Decoration
  fixture("PLANT", "Plant", -6.4, 4.4, 0.5, 0.5),
  fixture("PLANT", "Plant", 6.4, 4.4, 0.5, 0.5),
  fixture("PLANT", "Plant", 2.2, 4.4, 0.45, 0.45),
];
