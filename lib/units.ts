import { Prisma } from "@/lib/generated/prisma/client";
import type { BaseUnit } from "@/lib/generated/prisma/enums";
import { DomainError } from "@/lib/errors";

export type InputUnit = "pcs" | "g" | "kg" | "ml" | "L";

const CONVERSIONS: Record<BaseUnit, Partial<Record<InputUnit, number>>> = {
  PCS: { pcs: 1 },
  G: { g: 1, kg: 1000 },
  ML: { ml: 1, L: 1000 },
};

/**
 * Convert a user-entered quantity to the ingredient's base unit using exact
 * decimal arithmetic. Throws if the unit is incompatible (e.g. "ml" for a gram ingredient).
 */
export function toBaseUnit(quantity: string, inputUnit: InputUnit, baseUnit: BaseUnit): Prisma.Decimal {
  const factor = CONVERSIONS[baseUnit][inputUnit];
  if (factor === undefined) {
    throw new DomainError(`Unit "${inputUnit}" cannot be used for an ingredient measured in ${baseUnit.toLowerCase()}.`);
  }
  const value = new Prisma.Decimal(quantity).mul(factor);
  if (value.decimalPlaces() > 3) {
    throw new DomainError("Quantity is too precise (max 3 decimal places in base unit).");
  }
  return value;
}

/**
 * Convert a cost entered per `inputUnit` (e.g. RM 11.00 per kg) to cost per ONE
 * base unit (RM 0.011 per g). Returns null for an empty cost.
 */
export function costPerBaseUnit(cost: string | null, inputUnit: InputUnit | undefined, baseUnit: BaseUnit): Prisma.Decimal | null {
  if (cost === null) return null;
  const unit = inputUnit ?? ({ PCS: "pcs", G: "g", ML: "ml" } as const)[baseUnit];
  const factor = CONVERSIONS[baseUnit][unit];
  if (factor === undefined) {
    throw new DomainError(`Cost unit "${unit}" doesn't match an ingredient measured in ${baseUnit.toLowerCase()}.`);
  }
  const value = new Prisma.Decimal(cost).div(factor);
  if (value.decimalPlaces() > 6) throw new DomainError("Cost is too precise to store (max 6 decimal places per base unit).");
  return value;
}
