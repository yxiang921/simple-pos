"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOrder, requireContext } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { cancelOrder, setPaymentStatus, updateOrderStatus } from "@/lib/services/orders";
import { cancelOrderSchema, idString } from "@/lib/validation";

const statusSchema = z.object({
  orderId: idString,
  status: z.enum(["PENDING", "PREPARING", "READY", "COMPLETED"]),
});

function revalidate() {
  revalidatePath("/admin", "layout");
}

export async function updateOrderStatusAction(orderId: string, status: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = statusSchema.parse({ orderId, status });
    await assertOrder(ctx, input.orderId);
    await updateOrderStatus(input.orderId, input.status);
    revalidate();
  });
}

export async function cancelOrderAction(orderId: string, reason: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = cancelOrderSchema.parse({ orderId, reason });
    await assertOrder(ctx, input.orderId);
    const res = await cancelOrder(input.orderId, input.reason, ctx.admin.email);
    revalidate();
    return res;
  });
}

export async function setPaymentStatusAction(orderId: string, paid: boolean) {
  const ctx = await requireContext();
  return runAction(async () => {
    const id = idString.parse(orderId);
    await assertOrder(ctx, id);
    await setPaymentStatus(id, z.boolean().parse(paid));
    revalidate();
  });
}
