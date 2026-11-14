"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { runAction } from "@/lib/action-utils";
import { changeExpenseAmount, createExpense, deleteExpense, updateExpense } from "@/lib/services/expenses";
import { expenseChangeSchema, expenseSchema, idString } from "@/lib/validation";

const revalidate = () => revalidatePath("/admin/costs");

export async function saveExpenseAction(id: string | null, payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    const input = expenseSchema.parse(payload);
    if (id) await updateExpense(idString.parse(id), input);
    else await createExpense(input);
    revalidate();
  });
}

export async function changeExpenseAmountAction(payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    const input = expenseChangeSchema.parse(payload);
    await changeExpenseAmount(input.id, input.amount, input.effectiveFrom);
    revalidate();
  });
}

export async function deleteExpenseAction(id: string) {
  await requireAdmin();
  return runAction(async () => {
    await deleteExpense(idString.parse(id));
    revalidate();
  });
}
