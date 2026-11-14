// Client-safe labels for operating expenses.

export type ExpenseCategoryCode = "RENT" | "UTILITIES" | "STAFF" | "EQUIPMENT" | "MAINTENANCE" | "MARKETING" | "LICENSES" | "OTHER";
export type ExpenseFrequencyCode = "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategoryCode, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities (electricity, water, gas, internet)",
  STAFF: "Staff salaries & EPF/SOCSO",
  EQUIPMENT: "Equipment & rental",
  MAINTENANCE: "Repairs & maintenance",
  MARKETING: "Marketing & delivery fees",
  LICENSES: "Licences, permits & insurance",
  OTHER: "Other",
};

export const EXPENSE_CATEGORY_SHORT: Record<ExpenseCategoryCode, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  STAFF: "Staff",
  EQUIPMENT: "Equipment",
  MAINTENANCE: "Maintenance",
  MARKETING: "Marketing",
  LICENSES: "Licences",
  OTHER: "Other",
};

export const EXPENSE_FREQUENCY_LABEL: Record<ExpenseFrequencyCode, string> = {
  ONE_TIME: "One-time",
  DAILY: "Per day",
  WEEKLY: "Per week",
  MONTHLY: "Per month",
  YEARLY: "Per year",
};
