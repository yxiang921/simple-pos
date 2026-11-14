import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatOrderNumber, formatRM, formatTime, ORDER_STATUS_LABEL } from "@/lib/format";
import { getGuestShop, guestPath } from "@/lib/tenant";

export const metadata: Metadata = { title: "Order placed", robots: { index: false } };

const STEPS = ["PENDING", "PREPARING", "READY", "COMPLETED"] as const;
const STEP_TEXT: Record<string, string> = {
  PENDING: "We've received your order and will start on it shortly.",
  PREPARING: "Our kitchen is preparing your order.",
  READY: "Your order is ready! Please collect it at the counter.",
  COMPLETED: "Enjoy your meal. Thank you!",
  CANCELLED: "This order was cancelled. Please speak to our staff if this is unexpected.",
};

export default async function OrderSuccessPage({ params }: PageProps<"/s/[merchant]/[branch]/success/[orderId]">) {
  await connection();
  const { orderId, merchant, branch } = await params;
  if (orderId.length > 64) notFound();
  const shop = await getGuestShop(merchant, branch);
  if (!shop) notFound();
  const base = guestPath(shop.merchant.slug, shop.branch.slug);
  // Only this branch's orders are shown under its URL.
  const order = await prisma.order.findFirst({
    where: { id: orderId, branchId: shop.branch.id },
    include: { items: { orderBy: { menuItemNameSnapshot: "asc" } } },
  });
  if (!order) notFound();

  const cancelled = order.status === "CANCELLED";
  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const live = !cancelled && order.status !== "COMPLETED";

  return (
    <main className="mx-auto max-w-lg pb-12 sm:px-4 sm:pt-6">
      <section className="card animate-pop relative mx-3 mt-4 overflow-hidden rounded-[26px] px-6 py-8 text-center sm:mx-0">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" aria-hidden />
        {!cancelled && (
          <span className="relative mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#e8a46d] to-primary text-white shadow-[0_12px_30px_-10px_var(--primary-glow)]">
            <Check className="size-7" strokeWidth={2.75} />
          </span>
        )}
        <p className="text-[13px] text-muted">{cancelled ? "Order cancelled" : "Order placed"}</p>
        <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-tight">{formatOrderNumber(order.orderNumber)}</p>
        <p className="mt-2 text-[14px]">
          {order.customerName}
          {order.tableNumber && <span className="text-muted"> · Table {order.tableNumber}</span>}
        </p>
        <p className="mx-auto mt-3 max-w-xs text-[14px] text-muted">{STEP_TEXT[order.status]}</p>

        {!cancelled && (
          <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s} className="text-center">
                <span
                  className={clsx(
                    "block h-1.5 rounded-full transition-colors duration-500",
                    i <= stepIndex ? "bg-gradient-to-r from-[#e8a46d] to-primary shadow-[0_0_10px_var(--primary-glow)]" : "bg-fill",
                  )}
                />
                <span
                  className={clsx("mt-1.5 block text-[12px]", i === stepIndex ? "font-semibold text-primary" : "text-muted")}
                  aria-current={i === stepIndex ? "step" : undefined}
                >
                  {ORDER_STATUS_LABEL[s]}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card animate-fade-up mx-3 mt-4 overflow-hidden rounded-[22px] [animation-delay:0.08s] sm:mx-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px] text-muted">
          <span>Placed at {formatTime(order.createdAt)}</span>
          <span className={order.paymentStatus === "PAID" ? "font-medium text-primary" : ""}>
            {order.paymentStatus === "PAID" ? "Paid" : "Pay at counter"}
          </span>
        </div>
        <ul className="divide-y divide-line px-5">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2.5 text-[14px]">
              <span>
                <span className="tabular mr-2 text-muted">{i.quantity}×</span>
                {i.menuItemNameSnapshot}
              </span>
              <span className="tabular">{formatRM(i.subtotal.toString())}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line px-5 py-3 text-[16px] font-semibold">
          <span>Total</span>
          <span className="tabular">{formatRM(order.totalAmount.toString())}</span>
        </div>
      </section>

      <div className="mt-5 px-4 text-center sm:px-0">
        <Link
          href={base}
          className="press inline-flex h-11 items-center rounded-full border border-line bg-surface/70 px-6 text-[14px] font-medium hover:border-line-strong dark:bg-white/[0.06]"
        >
          Order something else
        </Link>
        {live && <p className="mt-3 text-[12px] text-muted">This page updates automatically.</p>}
      </div>
    </main>
  );
}
