import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";
import { changeHub, CHANNEL, type HubMessage } from "@/lib/realtime";
import { createOrder, updateOrderStatus } from "@/lib/services/orders";
import { orderInput, resetDb, seedBurgerScenario } from "./helpers";

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
  it("triggers send one notification per statement, tagged with schema and table", async () => {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    const got: { schema: string; table: string; op: string }[] = [];
    client.on("notification", (m) => got.push(JSON.parse(m.payload!)));

    const s = await seedBurgerScenario();
    got.length = 0;
    await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await until(() => got.some((g) => g.table === "orders" && g.op === "INSERT") && got.some((g) => g.table === "ingredients"));
    expect(got.every((g) => g.schema === dbSchema())).toBe(true);
    // 4 ingredient updates in one transaction collapse into a single notification
    expect(got.filter((g) => g.table === "ingredients" && g.op === "UPDATE")).toHaveLength(1);
    await client.end();
  });

  it("the hub goes live and forwards order status changes with the order id", async () => {
    const s = await seedBurgerScenario();
    const msgs: HubMessage[] = [];
    const unsubscribe = changeHub.subscribe((m) => msgs.push(m));
    await until(() => changeHub.status === "live");

    const o = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await until(() => msgs.some((m) => m.type === "change" && m.event.table === "orders" && m.event.op === "INSERT"));

    await updateOrderStatus(o.id, "PREPARING");
    await until(() => msgs.some((m) => m.type === "change" && m.event.id === o.id && m.event.status === "PREPARING"));
    unsubscribe();
  });
});
