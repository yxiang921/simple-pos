import { z } from "zod";

// Decimal strings are validated by regex and kept as strings so they can be
// converted to Prisma.Decimal without passing through floating point.

const trimmed = (max: number) => z.string().trim().max(max);

export const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter a valid amount, e.g. 12.90");

export const quantityString = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a valid quantity (max 3 decimal places)");

export const positiveQuantityString = quantityString.refine((v) => Number(v) > 0, "Must be greater than 0");

export const idString = z.string().trim().min(1).max(64);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

// ─── Auth ──────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase().max(254),
  password: z.string().min(1, "Password is required").max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: z.string().min(10, "Use at least 10 characters").max(200),
    confirmPassword: z.string().max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

// ─── Settings ──────────────────────────────────────────────────────────

export const storeSettingsSchema = z.object({
  storeName: trimmed(80).min(1, "Store name is required"),
  acceptingOrders: checkbox,
});

// ─── Categories ────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: trimmed(60).min(1, "Name is required"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: checkbox,
});

// ─── Ingredients ───────────────────────────────────────────────────────

export const baseUnitSchema = z.enum(["PCS", "G", "ML"]);
export const inputUnitSchema = z.enum(["pcs", "g", "kg", "ml", "L"]);

export const ingredientCreateSchema = z.object({
  name: trimmed(80).min(1, "Name is required"),
  sku: trimmed(40)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  unit: baseUnitSchema,
  initialStock: quantityString.default("0"),
  lowStockThreshold: quantityString.default("0"),
});

export const ingredientUpdateSchema = z.object({
  id: idString,
  name: trimmed(80).min(1, "Name is required"),
  sku: trimmed(40)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  lowStockThreshold: quantityString,
  isActive: checkbox,
});

export const stockAdjustmentSchema = z.object({
  ingredientId: idString,
  kind: z.enum(["RESTOCK", "DEDUCT"]),
  quantity: positiveQuantityString,
  inputUnit: inputUnitSchema,
  reason: trimmed(200).optional().default(""),
});

// ─── Menu ──────────────────────────────────────────────────────────────

export const recipeLineSchema = z.object({
  ingredientId: idString,
  quantity: positiveQuantityString,
  inputUnit: inputUnitSchema,
});

export const menuItemSchema = z
  .object({
    name: trimmed(100).min(1, "Name is required"),
    description: trimmed(500).default(""),
    price: moneyString,
    categoryId: idString,
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || v.startsWith("/"), "Enter a valid http(s) URL"),
    isAvailable: checkbox,
    recipe: z.array(recipeLineSchema).max(40, "Too many ingredients"),
  })
  .refine((v) => new Set(v.recipe.map((r) => r.ingredientId)).size === v.recipe.length, {
    path: ["recipe"],
    message: "Each ingredient can only appear once in the recipe",
  });

// ─── Orders ────────────────────────────────────────────────────────────

export const orderItemInputSchema = z.object({
  menuItemId: idString,
  quantity: z.coerce.number().int().min(1, "Minimum quantity is 1").max(50, "Maximum 50 per item"),
});

export const createOrderSchema = z.object({
  customerName: trimmed(60).min(1, "Please enter your name"),
  tableNumber: trimmed(10)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[A-Za-z0-9-]+$/.test(v), "Use letters, numbers or dashes only"),
  idempotencyKey: z.uuid("Invalid request key"),
  items: z
    .array(orderItemInputSchema)
    .min(1, "Your cart is empty")
    .max(30, "Too many different items in one order"),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  orderId: idString,
  reason: trimmed(200).min(1, "Please give a reason for cancelling"),
});

export function fieldErrors(error: z.ZodError): Record<string, string[] | undefined> {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
