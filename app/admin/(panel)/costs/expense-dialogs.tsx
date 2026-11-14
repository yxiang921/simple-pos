"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_FREQUENCY_LABEL,
  type ExpenseCategoryCode,
  type ExpenseFrequencyCode,
} from "@/lib/expense-labels";
import { formatRM } from "@/lib/format";
import { changeExpenseAmountAction, deleteExpenseAction, saveExpenseAction } from "../../_actions/expenses";

export type ExpenseRow = {
  id: string;
  name: string;
  category: ExpenseCategoryCode;
  amount: string;
  frequency: ExpenseFrequencyCode;
  startDate: string;
  endDate: string | null;
  notes: string;
};

type Errors = Record<string, string[] | undefined>;

/** Common Malaysian café costs to fill the form quickly. */
const PRESETS: { label: string; name: string; category: ExpenseCategoryCode; frequency: ExpenseFrequencyCode }[] = [
  { label: "Shop rent", name: "Shop rent", category: "RENT", frequency: "MONTHLY" },
  { label: "Electricity (TNB)", name: "Electricity (TNB)", category: "UTILITIES", frequency: "MONTHLY" },
  { label: "Water", name: "Water", category: "UTILITIES", frequency: "MONTHLY" },
  { label: "Gas", name: "Gas cylinders", category: "UTILITIES", frequency: "MONTHLY" },
  { label: "Internet", name: "Internet", category: "UTILITIES", frequency: "MONTHLY" },
  { label: "Staff salary", name: "Salary – ", category: "STAFF", frequency: "MONTHLY" },
  { label: "Licence", name: "Business licence", category: "LICENSES", frequency: "YEARLY" },
];

export function ExpenseToolbar({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> Add cost
      </Button>
      {open && <ExpenseDialog expense={null} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ExpenseRowActions({ expense, today }: { expense: ExpenseRow; today: string }) {
  const [dialog, setDialog] = useState<"edit" | "change" | "delete" | null>(null);
  const recurring = expense.frequency !== "ONE_TIME";
  return (
    <div className="flex items-center justify-end gap-1">
      {recurring && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setDialog("change")}
          aria-label={`Change amount of ${expense.name} from a date`}
          title="New amount from a date (keeps past months correct)"
        >
          <TrendingUp />
        </Button>
      )}
      <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${expense.name}`} title="Edit" onClick={() => setDialog("edit")}>
        <Pencil />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-danger hover:bg-danger-soft"
        aria-label={`Delete ${expense.name}`}
        title="Delete"
        onClick={() => setDialog("delete")}
      >
        <Trash2 />
      </Button>
      {dialog === "edit" && <ExpenseDialog expense={expense} today={today} onClose={() => setDialog(null)} />}
      {dialog === "change" && <ChangeDialog expense={expense} today={today} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteDialog expense={expense} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ExpenseDialog({ expense, today, onClose }: { expense: ExpenseRow | null; today: string; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    name: expense?.name ?? "",
    category: expense?.category ?? ("RENT" as ExpenseCategoryCode),
    amount: expense?.amount ?? "",
    frequency: expense?.frequency ?? ("MONTHLY" as ExpenseFrequencyCode),
    startDate: expense?.startDate ?? `${today.slice(0, 7)}-01`,
    endDate: expense?.endDate ?? "",
    notes: expense?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const oneTime = v.frequency === "ONE_TIME";

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense ? `Edit ${expense.name}` : "Add running cost"}
      description={expense ? "To change an amount from a certain date, use Change instead so past months stay correct." : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await saveExpenseAction(expense?.id ?? null, v);
            if (res.ok) {
              toast(expense ? "Cost updated" : `${v.name} added`);
              onClose();
            } else {
              setError(res.error);
              setFe(res.fieldErrors ?? {});
            }
          });
        }}
      >
        <FormError message={error} />
        {!expense && (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setV((s) => ({ ...s, name: p.name, category: p.category, frequency: p.frequency }))}
                className="rounded-[4px] border border-line-strong px-2 py-1 text-[12px] hover:bg-hover"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <Field label="Name" htmlFor="exp-name" error={fe.name}>
          <Input id="exp-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" htmlFor="exp-cat" error={fe.category}>
            <Select id="exp-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ExpenseCategoryCode })}>
              {Object.entries(EXPENSE_CATEGORY_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How often" htmlFor="exp-freq" error={fe.frequency}>
            <Select id="exp-freq" value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value as ExpenseFrequencyCode })}>
              {Object.entries(EXPENSE_FREQUENCY_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Amount (RM)" htmlFor="exp-amount" error={fe.amount}>
            <Input
              id="exp-amount"
              inputMode="decimal"
              className="tabular"
              value={v.amount}
              onChange={(e) => setV({ ...v, amount: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label={oneTime ? "Date" : "Starts"} htmlFor="exp-start" error={fe.startDate}>
            <Input id="exp-start" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          </Field>
          {!oneTime && (
            <Field label="Ends (optional)" htmlFor="exp-end" error={fe.endDate}>
              <Input id="exp-end" type="date" value={v.endDate} min={v.startDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Notes" htmlFor="exp-notes" error={fe.notes}>
          <Textarea id="exp-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={300} />
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !v.name.trim() || !v.amount}>
            {pending && <Loader2 className="animate-spin" />}
            {expense ? "Save" : "Add cost"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function ChangeDialog({ expense, today, onClose }: { expense: ExpenseRow; today: string; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(expense.amount);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={`Change ${expense.name}`}
      description={`Currently ${formatRM(expense.amount)} ${EXPENSE_FREQUENCY_LABEL[expense.frequency].toLowerCase()}. Earlier months keep the old amount.`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await changeExpenseAmountAction({ id: expense.id, amount, effectiveFrom: from });
            if (res.ok) {
              toast(`${expense.name}: ${formatRM(amount)} from ${from}`);
              onClose();
            } else setError(res.error);
          });
        }}
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="New amount (RM)" htmlFor="chg-amount">
            <Input id="chg-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Effective from" htmlFor="chg-from">
            <Input id="chg-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !amount || !from}>
            {pending && <Loader2 className="animate-spin" />}
            Apply change
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ expense, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={`Delete ${expense.name}?`}
      description="It will be removed from every month. If the cost simply stopped (e.g. a staff member left), edit it and set an end date instead."
    >
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteExpenseAction(expense.id);
              if (res.ok) {
                toast(`${expense.name} deleted`);
                onClose();
              } else toast(res.error, "error");
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
