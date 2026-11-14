import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { installSampleCatalog } from "@/lib/sample-catalog";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";
import { DEFAULT_TZ } from "@/lib/time";

export type RegisterInput = {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  /** Extra branch names besides headquarters (empty = single outlet). */
  branches: string[];
  sampleData: boolean;
};

export class FieldError extends DomainError {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message, "FIELD");
  }
}

export async function isSlugAvailable(slug: string) {
  if (RESERVED_SLUGS.has(slug)) return false;
  return !(await prisma.merchant.findUnique({ where: { slug }, select: { id: true } }));
}

/**
 * Sign up a merchant: the business, its headquarters branch (+ optional extra
 * branches), shared settings and the owner account. Optionally installs the
 * sample menu, ingredients and floor plan so the shop can take orders at once.
 */
export async function registerMerchant(input: RegisterInput) {
  if (!(await isSlugAvailable(input.slug))) throw new FieldError("slug", "This shop URL is already taken. Try another.");
  if (await prisma.adminUser.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new FieldError("email", "An account with this email already exists. Sign in instead.");
  }
  const passwordHash = await hashPassword(input.password);

  // Branch URL names, unique within the merchant ("hq" is headquarters).
  const used = new Set(["hq"]);
  const extra = input.branches.map((name) => {
    const base = slugify(name, "branch");
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base.slice(0, 36)}-${n}`;
    used.add(slug);
    return { name, slug };
  });

  let created: { merchantId: string; userId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({ data: { slug: input.slug, name: input.businessName } });
      await tx.storeSetting.create({ data: { merchantId: merchant.id, storeName: input.businessName, timezone: DEFAULT_TZ } });
      await tx.branch.create({
        data: {
          merchantId: merchant.id,
          slug: "hq",
          name: extra.length ? "Headquarters" : "Main outlet",
          isHeadquarters: true,
          sortOrder: 0,
        },
      });
      for (const [i, b] of extra.entries()) {
        await tx.branch.create({ data: { merchantId: merchant.id, slug: b.slug, name: b.name, sortOrder: i + 1 } });
      }
      const user = await tx.adminUser.create({
        data: { merchantId: merchant.id, email: input.email, name: input.ownerName, passwordHash },
      });
      return { merchantId: merchant.id, userId: user.id };
    });
  } catch (err) {
    if (isUniqueViolation(err, "slug")) throw new FieldError("slug", "This shop URL is already taken. Try another.");
    if (isUniqueViolation(err, "email")) throw new FieldError("email", "An account with this email already exists. Sign in instead.");
    throw err;
  }

  if (input.sampleData) await installSampleCatalog(created.merchantId, { actor: input.email });
  return created;
}
