// Client-safe floor-plan types and helpers (used by the 3D view, the server and tests).

export const FLOOR_KINDS = ["TABLE", "COUNTER", "PASS", "KITCHEN", "ENTRANCE", "BAR", "WALL", "PLANT"] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];
export type FloorShapeCode = "RECT" | "ROUND";

/** One piece of furniture / fixture. Position = centre in metres, rotation in degrees. */
export type FloorObjectData = {
  id: string;
  kind: FloorKind;
  label: string;
  tableNumber: string | null;
  seats: number | null;
  shape: FloorShapeCode;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
};

export type OpenOrderStatus = "PENDING" | "PREPARING" | "READY";
export const OPEN_ORDER_STATUSES: OpenOrderStatus[] = ["PENDING", "PREPARING", "READY"];

export type FloorOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  tableNumber: string | null;
  status: OpenOrderStatus;
  paymentStatus: "PAID" | "UNPAID";
  createdAt: string;
  totalAmount: string;
  items: { name: string; quantity: number }[];
};

export const KIND_LABEL: Record<FloorKind, string> = {
  TABLE: "Table",
  COUNTER: "Counter",
  PASS: "Pickup point",
  KITCHEN: "Kitchen",
  ENTRANCE: "Entrance",
  BAR: "Drinks bar",
  WALL: "Wall",
  PLANT: "Plant",
};

/** Defaults used when adding a new object in the layout editor. */
export const KIND_DEFAULTS: Record<FloorKind, Omit<FloorObjectData, "id" | "x" | "z" | "rotation" | "tableNumber">> = {
  TABLE: { kind: "TABLE", label: "Table", seats: 4, shape: "RECT", width: 0.9, depth: 0.9 },
  COUNTER: { kind: "COUNTER", label: "Counter", seats: null, shape: "RECT", width: 3, depth: 0.7 },
  PASS: { kind: "PASS", label: "Pickup point", seats: null, shape: "RECT", width: 1.6, depth: 0.6 },
  KITCHEN: { kind: "KITCHEN", label: "Kitchen", seats: null, shape: "RECT", width: 4, depth: 3 },
  ENTRANCE: { kind: "ENTRANCE", label: "Entrance", seats: null, shape: "RECT", width: 1.6, depth: 0.8 },
  BAR: { kind: "BAR", label: "Drinks bar", seats: null, shape: "RECT", width: 2, depth: 0.6 },
  WALL: { kind: "WALL", label: "Wall", seats: null, shape: "RECT", width: 2, depth: 0.12 },
  PLANT: { kind: "PLANT", label: "Plant", seats: null, shape: "ROUND", width: 0.5, depth: 0.5 },
};

/**
 * Normalise a table number so "T05", "t 5", "Table 5" and "5" all match.
 * Letters are kept ("A3" → "a3"); returns null for empty input.
 */
export function normalizeTableNumber(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim().toLowerCase();
  s = s.replace(/^(?:table|meja|tbl|no\.?)\s*[-#:.]?\s*/, "");
  s = s.replace(/^t\s*[-#:.]?\s*(?=\d)/, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s || null;
}

// ─── status colours ────────────────────────────────────────────────────

export const FLOOR_COLORS = {
  free: "#5E9C76",
  start: { h: 45, s: 0.86, l: 0.56 }, // yellow: order just placed
  end: { h: 4, s: 0.72, l: 0.46 }, // red: alert time reached
};

/** 0 = just ordered, 1 = alert time reached (can exceed 1). */
export function orderHeat(ageMs: number, alertMinutes: number): number {
  return Math.max(0, ageMs) / (Math.max(1, alertMinutes) * 60_000);
}

function hslToHex(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Yellow → red as heat goes 0 → 1; null (no open order) = green. */
export function heatColor(heat: number | null): string {
  if (heat === null) return FLOOR_COLORS.free;
  const t = Math.min(1, Math.max(0, heat));
  const { start: a, end: b } = FLOOR_COLORS;
  return hslToHex(a.h + (b.h - a.h) * t, a.s + (b.s - a.s) * t, a.l + (b.l - a.l) * t);
}

/** "now", "7m", "1h 05m", "2d" */
export function formatAge(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d`;
}

// ─── status per object ─────────────────────────────────────────────────

export type ObjectStatus = { orders: FloorOrder[]; oldestMs: number | null; heat: number | null };

export type FloorStatus = {
  byObject: Map<string, ObjectStatus>;
  /** Orders without a table number (takeaway / counter pickup), shown on the pickup point. */
  takeaway: ObjectStatus;
  /** Orders whose table number isn't on the floor plan, grouped by raw table number. */
  unknown: { tableNumber: string; orders: FloorOrder[]; oldestMs: number }[];
  tables: number;
  occupied: number;
  overdue: number;
};

function summarize(orders: FloorOrder[], nowMs: number, alertMinutes: number): ObjectStatus {
  if (!orders.length) return { orders, oldestMs: null, heat: null };
  const oldest = Math.min(...orders.map((o) => Date.parse(o.createdAt)));
  const age = nowMs - oldest;
  return { orders, oldestMs: age, heat: orderHeat(age, alertMinutes) };
}

export function computeFloorStatus(
  objects: FloorObjectData[],
  orders: FloorOrder[],
  nowMs: number,
  alertMinutes: number,
): FloorStatus {
  const tables = objects.filter((o) => o.kind === "TABLE");
  const byKey = new Map<string, FloorObjectData>();
  for (const t of tables) {
    const k = normalizeTableNumber(t.tableNumber);
    if (k && !byKey.has(k)) byKey.set(k, t);
  }
  const perTable = new Map<string, FloorOrder[]>();
  const takeaway: FloorOrder[] = [];
  const unknown = new Map<string, FloorOrder[]>();
  for (const o of orders) {
    const k = normalizeTableNumber(o.tableNumber);
    if (!k) takeaway.push(o);
    else if (byKey.has(k)) perTable.set(byKey.get(k)!.id, [...(perTable.get(byKey.get(k)!.id) ?? []), o]);
    else unknown.set(o.tableNumber!, [...(unknown.get(o.tableNumber!) ?? []), o]);
  }

  const byObject = new Map<string, ObjectStatus>();
  let occupied = 0;
  let overdue = 0;
  for (const t of tables) {
    const s = summarize(perTable.get(t.id) ?? [], nowMs, alertMinutes);
    byObject.set(t.id, s);
    if (s.heat !== null) {
      occupied++;
      if (s.heat >= 1) overdue++;
    }
  }
  const take = summarize(takeaway, nowMs, alertMinutes);
  for (const p of objects.filter((o) => o.kind === "PASS")) byObject.set(p.id, take);

  return {
    byObject,
    takeaway: take,
    unknown: [...unknown.entries()]
      .map(([tableNumber, os]) => ({ tableNumber, orders: os, oldestMs: summarize(os, nowMs, alertMinutes).oldestMs! }))
      .sort((a, b) => b.oldestMs - a.oldestMs),
    tables: tables.length,
    occupied,
    overdue,
  };
}

// ─── geometry helpers ──────────────────────────────────────────────────

export type ChairSpot = { x: number; z: number; facing: number };

/**
 * Chair positions around a table, in the table's local coordinates.
 * `facing` is the angle (radians, around Y) a chair at (x, z) needs to face the table centre.
 */
export function chairSpots(t: { shape: FloorShapeCode; width: number; depth: number; seats: number | null }): ChairSpot[] {
  const n = Math.max(0, Math.min(30, t.seats ?? 0));
  if (!n) return [];
  const gap = 0.34;
  const face = (x: number, z: number) => Math.atan2(-x, -z);
  if (t.shape === "ROUND") {
    const r = Math.max(t.width, t.depth) / 2 + gap;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      return { x, z, facing: face(x, z) };
    });
  }
  const alongX = t.width >= t.depth;
  const long = alongX ? t.width : t.depth;
  const short = alongX ? t.depth : t.width;
  const capacity = Math.max(1, Math.floor(long / 0.55));
  let ends = n === 1 ? 0 : n % 2;
  let side = n - ends;
  while (Math.ceil(side / 2) > capacity && ends < 2) {
    ends++;
    side--;
  }
  const a = n === 1 ? 1 : Math.ceil(side / 2);
  const b = n === 1 ? 0 : side - a;
  const spots: ChairSpot[] = [];
  const row = (count: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const along = ((i + 0.5) / count - 0.5) * long;
      const x = alongX ? along : offset;
      const z = alongX ? offset : along;
      spots.push({ x, z, facing: face(x, z) });
    }
  };
  row(a, short / 2 + gap);
  row(b, -(short / 2 + gap));
  for (let i = 0; i < ends; i++) {
    const off = (i === 0 ? 1 : -1) * (long / 2 + gap);
    const x = alongX ? off : 0;
    const z = alongX ? 0 : off;
    spots.push({ x, z, facing: face(x, z) });
  }
  return spots;
}
