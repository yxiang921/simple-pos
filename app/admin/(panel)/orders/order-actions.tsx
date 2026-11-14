"use client";

import { useState, useTransition } from "react";
import { Ban, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatOrderNumber, formatQty, formatRM, type BaseUnitCode, type OrderStatusCode } from "@/lib/format";
import { cancelOrderAction, setPaymentStatusAction, updateOrderStatusAction } from "../../_actions/orders";
import { OrderStatusBadge } from "./status-badge";

export type OrderDetail = {
  id: string;
  orderNumber: number;
  customerName: string;
  tableNumber: string | null;
  status: OrderStatusCode;
  paymentStatus: "PAID" | "UNPAID";
  totalAmount: string;
  createdAt: string;
  cancelReason: string | null;
  /** Table number as it is on the floor plan, when the order's table is on it. */
  floorTable?: string | null;
  /** Generated history: view only. */
  isSimulated?: boolean;
  items: { id: string; name: string; quantity: number; unitPrice: string; subtotal: string }[];
  ingredients: { id: string; name: string; unit: BaseUnitCode; quantity: string }[];
};

const NEXT_STEP: Partial<Record<OrderStatusCode, { status: OrderStatusCode; label: string }>> = {
  PENDING: { status: "PREPARING", label: "Start" },
  PREPARING: { status: "READY", label: "Ready" },
  READY: { status: "COMPLETED", label: "Complete" },
};

export function OrderActions({ order }: { order: OrderDetail }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const next = NEXT_STEP[order.status];
  const final = order.status === "COMPLETED" || order.status === "CANCELLED";
  const readOnly = order.isSimulated === true;

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) toast(success);
      else toast(res.error ?? "Failed", "error");
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {next && !readOnly && (
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() =>
            run("next", () => updateOrderStatusAction(order.id, next.status), `${formatOrderNumber(order.orderNumber)} → ${next.status.toLowerCase()}`)
          }
          className="min-w-[72px]"
        >
          {busy === "next" ? <Loader2 className="animate-spin" /> : next.label}
        </Button>
      )}
      {order.status !== "CANCELLED" && !readOnly && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              "pay",
              () => setPaymentStatusAction(order.id, order.paymentStatus !== "PAID"),
              order.paymentStatus === "PAID" ? "Marked as unpaid" : "Marked as paid",
            )
          }
          className="min-w-[78px]"
        >
          {busy === "pay" ? <Loader2 className="animate-spin" /> : order.paymentStatus === "PAID" ? "Unpay" : "Mark paid"}
        </Button>
      )}
      <Button size="icon" variant="ghost" className="size-7" aria-label="View order" title="View" onClick={() => setViewOpen(true)}>
        <Eye />
      </Button>
      {!final && !readOnly && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-danger hover:bg-danger-soft"
          aria-label="Cancel order"
          title="Cancel order"
          onClick={() => setCancelOpen(true)}
        >
          <Ban />
        </Button>
      )}

      <OrderViewDialog order={order} open={viewOpen} onClose={() => setViewOpen(false)} />
      <CancelDialog order={order} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </div>
  );
}

function OrderViewDialog({ order, open, onClose }: { order: OrderDetail; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={`Order ${formatOrderNumber(order.orderNumber)}`}
      description={`${order.customerName}${order.tableNumber ? ` · Table ${order.tableNumber}` : ""} · ${formatDateTime(order.createdAt)}`}
    >
      <div className="space-y-5 text-left text-[13px]">
        <div className="flex gap-2">
          <OrderStatusBadge status={order.status} />
          {order.paymentStatus === "PAID" ? <Badge tone="green">Paid</Badge> : <Badge tone="outline">Unpaid</Badge>}
        </div>
        {order.cancelReason && (
          <p className="rounded-[4px] border border-line bg-[#fafaf8] px-3 py-2">
            <span className="font-medium">Cancellation reason:</span> {order.cancelReason}
          </p>
        )}
        <table className="w-full">
          <thead className="border-b border-line text-[12px] uppercase tracking-[0.03em] text-muted">
            <tr>
              <th className="py-1.5 text-left font-medium">Item</th>
              <th className="py-1.5 text-right font-medium">Qty</th>
              <th className="py-1.5 text-right font-medium">Unit</th>
              <th className="py-1.5 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {order.items.map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="py-1.5">{i.name}</td>
                <td className="py-1.5 text-right">{i.quantity}</td>
                <td className="py-1.5 text-right">{formatRM(i.unitPrice)}</td>
                <td className="py-1.5 text-right">{formatRM(i.subtotal)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="py-2 text-right font-medium">
                Total
              </td>
              <td className="py-2 text-right font-semibold">{formatRM(order.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
        <div>
          <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.03em] text-muted">
            Ingredients deducted {order.status === "CANCELLED" && "(restored on cancellation)"}
          </p>
          {order.ingredients.length === 0 ? (
            <p className="text-muted">No recipe ingredients.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {order.ingredients.map((g) => (
                <div key={g.id} className="flex justify-between border-b border-line py-1">
                  <span className="truncate pr-2">{g.name}</span>
                  <span className="tabular text-muted">{formatQty(g.quantity, g.unit)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function CancelDialog({ order, open, onClose }: { order: OrderDetail; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await cancelOrderAction(order.id, reason);
      if (res.ok) {
        toast(`${formatOrderNumber(order.orderNumber)} cancelled · stock restored for ${res.data.restoredIngredients} ingredient(s)`);
        setReason("");
        onClose();
      } else setError(res.error);
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="sm"
      title={`Cancel order ${formatOrderNumber(order.orderNumber)}?`}
      description="All ingredients deducted for this order will be returned to inventory."
    >
      <div className="text-left">
        <Field label="Reason" htmlFor={`reason-${order.id}`} error={error ?? undefined}>
          <Textarea
            id={`reason-${order.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed their mind"
            maxLength={200}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button onClick={onClose} disabled={pending}>
            Keep order
          </Button>
          <Button variant="danger" onClick={submit} disabled={pending || !reason.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            Cancel order
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
