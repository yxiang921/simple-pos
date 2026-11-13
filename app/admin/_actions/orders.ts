"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
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
  await requireAdmin();
  return runAction(async () => {
    const input = statusSchema.parse({ orderId, status });
    await updateOrderStatus(input.orderId, input.status);
    revalidate();
  });
}

export async function cancelOrderAction(orderId: string, reason: string) {
  const admin = await requireAdmin();
  return runAction(async () => {
    const input = cancelOrderSchema.parse({ orderId, reason });
    const res = await cancelOrder(input.orderId, input.reason, admin.email);
    revalidate();
    return res;
  });
}

export async function setPaymentStatusAction(orderId: string, paid: boolean) {
  await requireAdmin();
  return runAction(async () => {
    await setPaymentStatus(idString.parse(orderId), z.boolean().parse(paid));
    revalidate();
  });
}
