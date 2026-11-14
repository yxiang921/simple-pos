import { z } from "zod";
import { RESERVED_SLUGS, SLUG_RE } from "@/lib/slug";
import { FLOOR_KINDS, normalizeTableNumber } from "./floor";

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

const slugField = (label: string) =>
  trimmed(40)
    .toLowerCase()
    .min(2, `${label} needs at least 2 characters`)
    .regex(SLUG_RE, "Use lowercase letters, numbers and dashes; start and end with a letter or number");

export const branchSchema = z.object({
  name: trimmed(60).min(1, "Branch name is required"),
  slug: slugField("URL name"),
  address: trimmed(200).default(""),
  isActive: z.boolean().optional(),
});
export type BranchFormInput = z.input<typeof branchSchema>;

/** Merchant sign-up: the business, its owner account and (optionally) branches. */
export const registerSchema = z
  .object({
    businessName: trimmed(80).min(2, "Business name is required"),
    slug: slugField("Shop URL").refine((v) => !RESERVED_SLUGS.has(v), "This URL name is reserved"),
    ownerName: trimmed(80).min(1, "Your name is required"),
    email: z.email("Enter a valid email").trim().toLowerCase().max(254),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    hasBranches: checkbox,
    /** One branch name per line (besides headquarters). */
    branchNames: trimmed(2000).default(""),
    sampleData: checkbox,
  })
  .transform((v) => ({
    ...v,
    branches: v.hasBranches
      ? [...new Set(v.branchNames.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))].slice(0, 20)
      : [],
  }))
  .refine((v) => !v.hasBranches || v.branches.length > 0, { path: ["branchNames"], message: "Add at least one branch, one per line" })
  .refine((v) => v.branches.every((n) => n.length <= 60), { path: ["branchNames"], message: "Branch names can be up to 60 characters" });

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

const hhmm = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use 24-hour HH:MM, e.g. 07:30");

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const storeSettingsSchema = z.object({
  storeName: trimmed(80).min(1, "Store name is required"),
  acceptingOrders: checkbox,
  openTime: hhmm,
  closeTime: hhmm,
  timezone: trimmed(64)
    .optional()
    .transform((v) => v || "Asia/Kuala_Lumpur")
    .refine(isValidTimeZone, "Unknown time zone, e.g. Asia/Kuala_Lumpur"),
  orderAlertMinutes: z.coerce
    .number()
    .int("Whole minutes only")
    .min(1, "At least 1 minute")
    .max(240, "At most 240 minutes")
    .default(20),
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


/** Optional cost entered per kg / L / pcs etc. Empty = unknown (stored as null). */
const costFields = {
  cost: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{1,8}(\.\d{1,4})?$/.test(v), "Enter a cost like 11.00 (max 4 decimals)"),
  costUnit: z.enum(["pcs", "g", "kg", "ml", "L"]).optional(),
};

export const ingredientCreateSchema = z.object({
  name: trimmed(80).min(1, "Name is required"),
  sku: trimmed(40)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  unit: baseUnitSchema,
  initialStock: quantityString.default("0"),
  lowStockThreshold: quantityString.default("0"),
  ...costFields,
});

export const ingredientUpdateSchema = z.object({
  id: idString,
  name: trimmed(80).min(1, "Name is required"),
  sku: trimmed(40)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  lowStockThreshold: quantityString,
  isActive: checkbox,
  ...costFields,
});

export const stockAdjustmentSchema = z.object({
  ingredientId: idString,
  kind: z.enum(["RESTOCK", "DEDUCT"]),
  quantity: positiveQuantityString,
  inputUnit: inputUnitSchema,
  reason: trimmed(200).optional().default(""),
});

/** Stock in: one delivery with several lines. Line cost is the RM paid for that line (optional). */
export const stockReceiptSchema = z.object({
  branchId: idString.optional(),
  supplier: trimmed(80).default(""),
  reference: trimmed(60).default(""),
  note: trimmed(300).default(""),
  /** Local date the goods arrived (default today). */
  receivedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  updateCosts: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        ingredientId: idString,
        quantity: positiveQuantityString,
        inputUnit: inputUnitSchema,
        lineCost: z
          .union([moneyString, z.literal("")])
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1, "Add at least one ingredient")
    .max(80, "Too many lines in one delivery")
    .refine((ls) => new Set(ls.map((l) => l.ingredientId)).size === ls.length, "Each ingredient can appear only once"),
});
export type StockReceiptInput = z.output<typeof stockReceiptSchema>;

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
    /** "yes" | "no" | "" (not set → null) */
    isPreparedAhead: z
      .enum(["yes", "no", ""])
      .optional()
      .transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
    /** Comma-separated in the form; stored as a de-duplicated lowercase text[]. */
    aliases: z
      .string()
      .max(500)
      .optional()
      .transform((v) =>
        [...new Set((v ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
      )
      .refine((a) => a.every((x) => x.length <= 40), "Each alias must be 40 characters or less"),
    recipe: z.array(recipeLineSchema).max(40, "Too many ingredients"),
  })
  .refine((v) => new Set(v.recipe.map((r) => r.ingredientId)).size === v.recipe.length, {
    path: ["recipe"],
    message: "Each ingredient can only appear once in the recipe",
  });

// ─── Daily prep ────────────────────────────────────────────────────────

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((v) => !Number.isNaN(Date.parse(v + "T00:00:00Z")), "Invalid date");

export const dailyPrepSchema = z.object({
  date: isoDate,
  entries: z
    .array(
      z.object({
        menuItemId: idString,
        /** null / "" = not recorded (row removed) */
        plates: z
          .union([z.number(), z.string(), z.null()])
          .transform((v) => (v === null || v === "" ? null : Number(v)))
          .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 10000), "Plates must be a whole number 0–10000"),
      }),
    )
    .max(500),
});

// ─── Operating expenses ────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "STAFF", "EQUIPMENT", "MAINTENANCE", "MARKETING", "LICENSES", "OTHER"] as const;
export const EXPENSE_FREQUENCIES = ["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export const expenseSchema = z
  .object({
    name: trimmed(80).min(1, "Name is required"),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: moneyString.refine((v) => Number(v) > 0, "Amount must be more than 0"),
    frequency: z.enum(EXPENSE_FREQUENCIES),
    startDate: isoDate,
    endDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isoDate.safeParse(v).success, "Invalid date"),
    notes: trimmed(300).optional().default(""),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  })
  .transform((v) => (v.frequency === "ONE_TIME" ? { ...v, endDate: null } : v));

export const expenseChangeSchema = z.object({
  id: idString,
  amount: moneyString.refine((v) => Number(v) > 0, "Amount must be more than 0"),
  effectiveFrom: isoDate,
});

// ─── Floor plan ────────────────────────────────────────────────────────

const metres = (min: number, max: number) => z.number().finite().min(min).max(max);

export const floorObjectSchema = z
  .object({
    id: z.string().max(64).optional(),
    kind: z.enum(FLOOR_KINDS),
    label: trimmed(40).min(1, "Label is required"),
    tableNumber: z
      .string()
      .trim()
      .max(10)
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || /^[A-Za-z0-9 -]+$/.test(v), "Use letters, numbers or dashes"),
    seats: z.number().int().min(1).max(30).nullish(),
    shape: z.enum(["RECT", "ROUND"]).default("RECT"),
    x: metres(-60, 60),
    z: metres(-60, 60),
    width: metres(0.1, 30),
    depth: metres(0.05, 30),
    rotation: metres(-360, 360),
  })
  .superRefine((o, ctx) => {
    if (o.kind !== "TABLE") return;
    if (!normalizeTableNumber(o.tableNumber)) ctx.addIssue({ code: "custom", path: ["tableNumber"], message: `${o.label}: table number is required` });
    if (!o.seats) ctx.addIssue({ code: "custom", path: ["seats"], message: `${o.label}: number of seats is required` });
  });

export const floorLayoutSchema = z
  .object({
    floorWidth: metres(3, 100),
    floorDepth: metres(3, 100),
    objects: z.array(floorObjectSchema).max(300, "Too many objects"),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, string>();
    v.objects.forEach((o, i) => {
      if (o.kind === "TABLE") {
        const k = normalizeTableNumber(o.tableNumber);
        if (k && seen.has(k)) {
          ctx.addIssue({ code: "custom", path: ["objects", i, "tableNumber"], message: `Table number ${o.tableNumber} is used twice (${seen.get(k)} and ${o.label})` });
        } else if (k) seen.set(k, o.label);
      }
      if (Math.abs(o.x) > v.floorWidth / 2 + 0.01 || Math.abs(o.z) > v.floorDepth / 2 + 0.01) {
        ctx.addIssue({ code: "custom", path: ["objects", i], message: `${o.label} is outside the floor` });
      }
    });
  });

export type FloorLayoutInput = z.output<typeof floorLayoutSchema>;

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
