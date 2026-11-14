/**
 * ILLUSTRATIVE demo values for the seeded "Kopi & Co." catalog.
 * These are typical Klang Valley café figures for a demo — not real supplier
 * prices. Only applied by `npm run db:seed` (fresh catalog) or
 * `scripts/simulate-history.ts --demo-defaults`, and only where the value is
 * currently empty (null), so real data entered by staff is never overwritten.
 */

/** Ingredient cost in RM per kg (G), per L (ML) or per piece (PCS), keyed by SKU. */
export const DEMO_COSTS: Record<string, string> = {
  "DRY-RICE": "3.20",
  "LIQ-SANTAN": "12.00",
  "SAU-SAMBAL": "18.00",
  "DRY-BILIS": "40.00",
  "DRY-PNUT": "14.00",
  "FRS-EGG": "0.45",
  "VEG-CUKE": "5.00",
  "MEA-CTHIGH": "11.00",
  "FRZ-CPATTY": "1.80",
  "BAK-BUN": "0.80",
  "VEG-LETT": "9.00",
  "SAU-MAYO": "12.00",
  "FRZ-FRIES": "9.00",
  "NOO-YELLOW": "5.00",
  "NOO-KWAYT": "5.00",
  "SEA-PRAWN": "38.00",
  "VEG-TAUGE": "4.00",
  "SAU-SOY": "8.00",
  "BAK-BREAD": "0.20",
  "SPR-KAYA": "16.00",
  "DAI-BUTTER": "36.00",
  "FRZ-ROTI": "0.60",
  "SAU-DHAL": "6.00",
  "BEV-TEA": "30.00",
  "BEV-KOPI": "35.00",
  "DAI-CONDM": "9.00",
  "DAI-EVAPM": "8.00",
  "DRY-SUGAR": "2.85",
  "BEV-MILO": "30.00",
  "FRT-LIMAU": "0.15",
  "DES-CENDOL": "10.00",
  "DES-GULAM": "14.00",
  "DES-REDBN": "10.00",
  "BEV-WATER": "0.60",
};

/** Per menu item (by name): prepared ahead?, aliases, and typical plates/day used by the simulator. */
export const DEMO_MENU: Record<string, { preparedAhead: boolean; aliases: string[]; baseDemand: number }> = {
  "Nasi Lemak Ayam Goreng": { preparedAhead: true, aliases: ["nl ayam", "ayam", "nasi lemak ayam"], baseDemand: 38 },
  "Nasi Lemak Biasa": { preparedAhead: true, aliases: ["nl biasa", "nasi lemak", "nl kosong"], baseDemand: 32 },
  "Mee Goreng Mamak": { preparedAhead: false, aliases: ["mee goreng", "mee mamak", "mgm"], baseDemand: 16 },
  "Char Kway Teow": { preparedAhead: false, aliases: ["ckt", "kway teow"], baseDemand: 12 },
  "Chicken Burger": { preparedAhead: false, aliases: ["burger", "burger ayam"], baseDemand: 10 },
  "Chicken Burger Combo": { preparedAhead: false, aliases: ["combo", "burger set"], baseDemand: 9 },
  "French Fries": { preparedAhead: false, aliases: ["fries", "kentang goreng"], baseDemand: 12 },
  "Roti Bakar Kaya": { preparedAhead: false, aliases: ["roti bakar", "kaya toast"], baseDemand: 18 },
  "Half-Boiled Eggs (2)": { preparedAhead: false, aliases: ["telur", "telur separuh masak", "half boiled"], baseDemand: 14 },
  "Roti Canai with Dhal": { preparedAhead: false, aliases: ["roti canai", "roti", "canai"], baseDemand: 26 },
  "Teh Tarik": { preparedAhead: false, aliases: ["teh", "tarik"], baseDemand: 55 },
  "Kopi O": { preparedAhead: false, aliases: ["kopi", "kopi-o"], baseDemand: 30 },
  "Milo Ais": { preparedAhead: false, aliases: ["milo", "milo ice"], baseDemand: 26 },
  "Limau Ais": { preparedAhead: false, aliases: ["limau", "lime juice"], baseDemand: 16 },
  "Mineral Water": { preparedAhead: false, aliases: ["air mineral", "water"], baseDemand: 12 },
  Cendol: { preparedAhead: true, aliases: ["chendol"], baseDemand: 14 },
};

export const DEMO_HOURS = { openTime: "07:00", closeTime: "21:00" };

/**
 * ILLUSTRATIVE running costs for a small Klang Valley café (RM). Inserted only
 * when the expenses table is empty, flagged is_simulated = true.
 */
export const DEMO_EXPENSES: {
  name: string;
  category: "RENT" | "UTILITIES" | "STAFF" | "EQUIPMENT" | "MAINTENANCE" | "MARKETING" | "LICENSES" | "OTHER";
  amount: string;
  frequency: "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
}[] = [
  { name: "Shop rent", category: "RENT", amount: "4500.00", frequency: "MONTHLY" },
  { name: "Electricity (TNB)", category: "UTILITIES", amount: "1350.00", frequency: "MONTHLY" },
  { name: "Water", category: "UTILITIES", amount: "160.00", frequency: "MONTHLY" },
  { name: "Gas cylinders", category: "UTILITIES", amount: "380.00", frequency: "MONTHLY" },
  { name: "Internet", category: "UTILITIES", amount: "129.00", frequency: "MONTHLY" },
  { name: "Salary – Cook", category: "STAFF", amount: "2400.00", frequency: "MONTHLY" },
  { name: "Salary – Kitchen helper", category: "STAFF", amount: "1800.00", frequency: "MONTHLY" },
  { name: "Salary – Cashier", category: "STAFF", amount: "1700.00", frequency: "MONTHLY" },
  { name: "EPF / SOCSO / EIS (employer)", category: "STAFF", amount: "780.00", frequency: "MONTHLY" },
  { name: "POS & software", category: "EQUIPMENT", amount: "99.00", frequency: "MONTHLY" },
  { name: "Pest control", category: "MAINTENANCE", amount: "150.00", frequency: "MONTHLY" },
  { name: "Business licence", category: "LICENSES", amount: "600.00", frequency: "YEARLY" },
  { name: "Shop insurance", category: "LICENSES", amount: "1200.00", frequency: "YEARLY" },
];
