import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";
import { changeHub, CHANNEL, type HubMessage } from "@/lib/realtime";
import { createOrder, updateOrderStatus } from "@/lib/services/orders";
import { orderInput, resetDb, seedBurgerScenario, T } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  changeHub.shutdown();
  await prisma.$disconnect();
});

async function until(check: () => boolean, ms = 8000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for notification");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("database change notifications", () => {
  it("triggers send one notification per statement, tagged with schema, table, merchant and branch", async () => {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    const got: { schema: string; table: string; op: string; m?: string | null; b?: string | null }[] = [];
    client.on("notification", (m) => got.push(JSON.parse(m.payload!)));

    const s = await seedBurgerScenario();
    got.length = 0;
    await createOrder(T.branchId, orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await until(() => got.some((g) => g.table === "orders" && g.op === "INSERT") && got.some((g) => g.table === "ingredient_stocks"));
    expect(got.every((g) => g.schema === dbSchema())).toBe(true);
    // 4 stock updates in one transaction collapse into a single notification for the branch
    const stock = got.filter((g) => g.table === "ingredient_stocks" && g.op === "UPDATE");
    expect(stock).toHaveLength(1);
    expect(stock[0].b).toBe(T.branchId);
    expect(got.find((g) => g.table === "orders" && g.op === "INSERT")!.b).toBe(T.branchId);
    await client.end();
  });

  it("the hub goes live and forwards order status changes with the order id", async () => {
    const s = await seedBurgerScenario();
    const msgs: HubMessage[] = [];
    const unsubscribe = changeHub.subscribe((m) => msgs.push(m));
    await until(() => changeHub.status === "live");

    const o = await createOrder(T.branchId, orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await until(() => msgs.some((m) => m.type === "change" && m.event.table === "orders" && m.event.op === "INSERT"));
    const ins = msgs.find((m) => m.type === "change" && m.event.table === "orders" && m.event.op === "INSERT");
    expect(ins?.type === "change" && ins.event.merchantId).toBe(T.merchantId); // resolved from the branch

    await updateOrderStatus(o.id, "PREPARING");
    await until(() => msgs.some((m) => m.type === "change" && m.event.id === o.id && m.event.status === "PREPARING"));
    unsubscribe();
  });
});
