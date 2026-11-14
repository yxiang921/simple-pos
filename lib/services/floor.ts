import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { normalizeTableNumber, OPEN_ORDER_STATUSES, type FloorObjectData, type FloorOrder } from "@/lib/floor";
import { SAMPLE_FLOOR, SAMPLE_LAYOUT } from "@/lib/floor-sample";
import type { FloorLayoutInput } from "@/lib/validation";

export type FloorData = {
  floorWidth: number;
  floorDepth: number;
  alertMinutes: number;
  objects: FloorObjectData[];
  orders: FloorOrder[];
  serverNow: string;
};

/**
 * The merchant's floor plan (shared by its branches) + every open (not completed
 * / cancelled) real order of one branch, for the live floor view.
 */
export async function getFloorData(merchantId: string, branchId: string): Promise<FloorData> {
  const [settings, objects, orders] = await Promise.all([
    prisma.storeSetting.findUnique({ where: { merchantId } }),
    prisma.floorObject.findMany({ where: { merchantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.order.findMany({
      where: { branchId, branch: { merchantId }, status: { in: OPEN_ORDER_STATUSES }, isSimulated: false },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: { items: { select: { menuItemNameSnapshot: true, quantity: true }, orderBy: { menuItemNameSnapshot: "asc" } } },
    }),
  ]);
  return {
    floorWidth: settings?.floorWidth ?? SAMPLE_FLOOR.width,
    floorDepth: settings?.floorDepth ?? SAMPLE_FLOOR.depth,
    alertMinutes: settings?.orderAlertMinutes ?? 20,
    objects: objects.map((o) => ({
      id: o.id,
      kind: o.kind,
      label: o.label,
      tableNumber: o.tableNumber,
      seats: o.seats,
      shape: o.shape,
      x: o.x,
      z: o.z,
      width: o.width,
      depth: o.depth,
      rotation: o.rotation,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      tableNumber: o.tableNumber,
      status: o.status as FloorOrder["status"],
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
      totalAmount: o.totalAmount.toFixed(2),
      items: o.items.map((i) => ({ name: i.menuItemNameSnapshot, quantity: i.quantity })),
    })),
    serverNow: new Date().toISOString(),
  };
}

/** Replace the whole floor plan (nothing references floor objects, so this is safe). */
export async function saveFloorLayout(merchantId: string, input: FloorLayoutInput) {
  return prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { name: true } });
    await tx.storeSetting.upsert({
      where: { merchantId },
      create: { merchantId, storeName: merchant.name, floorWidth: input.floorWidth, floorDepth: input.floorDepth },
      update: { floorWidth: input.floorWidth, floorDepth: input.floorDepth },
    });
    const own = new Set((await tx.floorObject.findMany({ where: { merchantId }, select: { id: true } })).map((o) => o.id));
    await tx.floorObject.deleteMany({ where: { merchantId } });
    if (input.objects.length) {
      await tx.floorObject.createMany({
        data: input.objects.map((o, i) => ({
          merchantId,
          // Keep ids of this merchant's existing objects; new ones (temporary "new-…" ids) get a fresh id.
          ...(o.id && own.has(o.id) ? { id: o.id } : {}),
          kind: o.kind,
          label: o.label,
          tableNumber: o.kind === "TABLE" ? normalizeTableNumber(o.tableNumber) : null,
          seats: o.kind === "TABLE" ? (o.seats ?? null) : null,
          shape: o.shape,
          x: round(o.x),
          z: round(o.z),
          width: round(o.width),
          depth: round(o.depth),
          rotation: round(((o.rotation % 360) + 360) % 360),
          sortOrder: i,
        })),
      });
    }
    return { objects: input.objects.length };
  });
}

/** Create the sample café layout. Refuses to overwrite an existing layout unless `replace`. */
export async function createSampleLayout(merchantId: string, opts: { replace?: boolean } = {}) {
  const existing = await prisma.floorObject.count({ where: { merchantId } });
  if (existing && !opts.replace) throw new DomainError("A floor plan already exists.");
  return saveFloorLayout(merchantId, {
    floorWidth: SAMPLE_FLOOR.width,
    floorDepth: SAMPLE_FLOOR.depth,
    objects: SAMPLE_LAYOUT.map((o) => ({ ...o, seats: o.seats ?? undefined })),
  });
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export type TableOption = { tableNumber: string; label: string; seats: number | null };

/** Tables on the floor plan, in natural order (1, 2, … 10, A1 …). */
export async function listTables(merchantId: string): Promise<TableOption[]> {
  const rows = await prisma.floorObject.findMany({
    where: { merchantId, kind: "TABLE", tableNumber: { not: null } },
    select: { tableNumber: true, label: true, seats: true },
  });
  return rows
    .map((r) => ({ tableNumber: r.tableNumber!, label: r.label, seats: r.seats }))
    .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
}

/**
 * Raw table_number values on orders that mean the given table (orders may hold
 * "T05", "5", "Table 5"…). Used to filter the Orders list by table.
 */
export async function tableNumberVariants(
  scope: { branchId: string } | { branch: { merchantId: string } },
  table: string,
): Promise<string[]> {
  const key = normalizeTableNumber(table);
  if (!key) return [];
  const rows = await prisma.order.groupBy({ by: ["tableNumber"], where: { ...scope, tableNumber: { not: null } } });
  return rows.map((r) => r.tableNumber!).filter((v) => normalizeTableNumber(v) === key);
}
