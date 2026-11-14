"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { changeExpenseAmount, createExpense, deleteExpense, updateExpense } from "@/lib/services/expenses";
import { expenseChangeSchema, expenseSchema, idString } from "@/lib/validation";

const revalidate = () => revalidatePath("/admin/costs");

export async function saveExpenseAction(id: string | null, payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = expenseSchema.parse(payload);
    if (id) await updateExpense(ctx.merchant.id, idString.parse(id), input);
    else await createExpense(ctx.merchant.id, input);
    revalidate();
  });
}

export async function changeExpenseAmountAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = expenseChangeSchema.parse(payload);
    await changeExpenseAmount(ctx.merchant.id, input.id, input.amount, input.effectiveFrom);
    revalidate();
  });
}

export async function deleteExpenseAction(id: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    await deleteExpense(ctx.merchant.id, idString.parse(id));
    revalidate();
  });
}
