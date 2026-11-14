import "server-only";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";

/**
 * Real-time change hub. One LISTEN connection per server process receives the
 * "pos_changes" notifications sent by the database triggers (see migration
 * 20261115010000_realtime_notify) and fans them out to subscribers — the SSE
 * endpoints that browsers connect to.
 *
 * LISTEN needs a session connection: REALTIME_DATABASE_URL, else DIRECT_URL
 * (Supabase session pooler / direct, port 5432). The transaction pooler
 * (port 6543) can't LISTEN; then the status stays "unavailable" and browsers
 * fall back to polling. A self-test NOTIFY (sent through the normal Prisma
 * connection) confirms delivery before reporting "live", and again every minute.
 *
 * Events carry the merchant / branch of the changed rows (see migration
 * 20261116000000_saas_multi_tenant), so each stream only passes on changes of
 * its own merchant. Events without either (recipe rows) go to everyone.
 */

export const CHANNEL = "pos_changes";

export type ChangeEvent = {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  /** Merchant of the changed rows; null when unknown (delivered to everyone). */
  merchantId: string | null;
  branchId: string | null;
  id?: string;
  status?: string;
  paymentStatus?: string;
};
export type HubStatus = "connecting" | "live" | "unavailable";
export type HubMessage = { type: "change"; event: ChangeEvent } | { type: "status"; status: HubStatus };
type Listener = (m: HubMessage) => void;

function listenUrl(): string | null {
  const url = process.env.REALTIME_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.port === "6543" || u.searchParams.get("pgbouncer") === "true") return null; // transaction pooler
  } catch {
    return null;
  }
  return url;
}

class ChangeHub {
  status: HubStatus = "connecting";
  private client: pg.Client | null = null;
  private connecting = false;
  private listeners = new Set<Listener>();
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pings = new Map<string, () => void>();
  private branchMerchant = new Map<string, string>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (!this.client && !this.connecting && !this.retryTimer) void this.connect();
    return () => {
      this.listeners.delete(fn);
      // Release the database connection when nobody has been listening for a minute.
      if (this.listeners.size === 0 && !this.idleTimer) this.idleTimer = setTimeout(() => this.shutdown(), 60_000);
    };
  }

  /** Close the LISTEN connection (tests, idle). */
  shutdown() {
    for (const t of [this.retryTimer, this.idleTimer]) if (t) clearTimeout(t);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.retryTimer = this.idleTimer = this.heartbeat = null;
    const c = this.client;
    this.client = null;
    c?.removeAllListeners();
    c?.end().catch(() => {});
    this.status = "connecting";
  }

  private setStatus(s: HubStatus) {
    if (s === this.status) return;
    this.status = s;
    for (const l of this.listeners) l({ type: "status", status: s });
  }

  private async connect() {
    const url = listenUrl();
    if (!url) {
      this.setStatus("unavailable");
      return;
    }
    this.connecting = true;
    const client = new pg.Client({ connectionString: url, keepAlive: true, application_name: "pos-realtime" });
    client.on("notification", (msg) => this.onNotification(msg.payload));
    client.on("error", () => this.drop(client));
    client.on("end", () => this.drop(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
      if (!(await this.selfTest(6000))) throw new Error("notifications are not delivered on this connection");
      this.retries = 0;
      this.setStatus("live");
      this.heartbeat = setInterval(async () => {
        if (this.client === client && !(await this.selfTest(10_000))) this.drop(client);
      }, 60_000);
    } catch (e) {
      console.warn(`[realtime] live updates unavailable (${e instanceof Error ? e.message : e}); browsers will poll instead`);
      if (this.client === client) this.client = null;
      client.removeAllListeners();
      client.end().catch(() => {});
      this.setStatus("unavailable");
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  /** Send a NOTIFY through the normal (Prisma) connection and wait for it to arrive here. */
  private async selfTest(timeoutMs: number): Promise<boolean> {
    const token = randomUUID();
    const arrived = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pings.delete(token);
        resolve(false);
      }, timeoutMs);
      this.pings.set(token, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    try {
      const payload = JSON.stringify({ schema: dbSchema(), table: "__ping", token });
      await prisma.$queryRaw`SELECT 1 AS ok FROM pg_notify(${CHANNEL}, ${payload})`;
    } catch {
      this.pings.delete(token);
      return false;
    }
    return arrived;
  }

  private async merchantOfBranch(branchId: string): Promise<string | null> {
    const known = this.branchMerchant.get(branchId);
    if (known) return known;
    const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { merchantId: true } }).catch(() => null);
    if (b) this.branchMerchant.set(branchId, b.merchantId);
    return b?.merchantId ?? null;
  }

  private async onNotification(payload?: string) {
    if (!payload) return;
    let e: {
      schema?: string;
      table?: string;
      op?: ChangeEvent["op"];
      m?: string | null;
      b?: string | null;
      id?: string;
      status?: string;
      paymentStatus?: string;
      token?: string;
    };
    try {
      e = JSON.parse(payload);
    } catch {
      return;
    }
    if (e.schema !== dbSchema() || !e.table) return;
    if (e.table === "__ping") {
      if (e.token) this.pings.get(e.token)?.();
      if (e.token) this.pings.delete(e.token);
      return;
    }
    const branchId = e.b ?? null;
    let merchantId = e.m ?? null;
    if (e.table === "merchants" && e.op !== "DELETE") merchantId = null; // a new merchant: refresh platform lists
    if (!merchantId && branchId) merchantId = await this.merchantOfBranch(branchId);
    const event: ChangeEvent = { table: e.table, op: e.op ?? "UPDATE", merchantId, branchId };
    if (e.id) Object.assign(event, { id: e.id, status: e.status, paymentStatus: e.paymentStatus });
    for (const l of this.listeners) l({ type: "change", event });
  }

  private drop(client: pg.Client) {
    if (client !== this.client) return;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.client = null;
    client.removeAllListeners();
    client.end().catch(() => {});
    this.setStatus("connecting");
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer || this.listeners.size === 0) return;
    const delay = Math.min(300_000, 1000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.listeners.size) void this.connect();
    }, delay);
  }
}

const g = globalThis as unknown as { posChangeHub?: ChangeHub };
export const changeHub: ChangeHub = g.posChangeHub ?? (g.posChangeHub = new ChangeHub());
