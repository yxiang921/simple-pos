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

/** Floor plan + every open (not completed / cancelled) real order, for the live floor view. */
export async function getFloorData(): Promise<FloorData> {
  const [settings, objects, orders] = await Promise.all([
    prisma.storeSetting.findUnique({ where: { id: 1 } }),
    prisma.floorObject.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.order.findMany({
      where: { status: { in: OPEN_ORDER_STATUSES }, isSimulated: false },
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
export async function saveFloorLayout(input: FloorLayoutInput) {
  return prisma.$transaction(async (tx) => {
    await tx.storeSetting.upsert({
      where: { id: 1 },
      create: { id: 1, floorWidth: input.floorWidth, floorDepth: input.floorDepth },
      update: { floorWidth: input.floorWidth, floorDepth: input.floorDepth },
    });
    await tx.floorObject.deleteMany({});
    if (input.objects.length) {
      await tx.floorObject.createMany({
        data: input.objects.map((o, i) => ({
          // Keep ids of existing objects; new ones (temporary "new-…" ids) get a fresh id.
          ...(o.id && !o.id.startsWith("new-") ? { id: o.id } : {}),
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
export async function createSampleLayout(opts: { replace?: boolean } = {}) {
  const existing = await prisma.floorObject.count();
  if (existing && !opts.replace) throw new DomainError("A floor plan already exists.");
  return saveFloorLayout({
    floorWidth: SAMPLE_FLOOR.width,
    floorDepth: SAMPLE_FLOOR.depth,
    objects: SAMPLE_LAYOUT.map((o) => ({ ...o, seats: o.seats ?? undefined })),
  });
}

const round = (v: number) => Math.round(v * 1000) / 1000;
