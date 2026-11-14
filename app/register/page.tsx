import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/platform";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register your business" };

export default async function RegisterPage() {
  if (await getCurrentAdmin()) redirect("/admin/dashboard");
  return (
    <main className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-[4px] bg-primary text-[13px] font-semibold text-white">
              {PLATFORM_NAME.slice(0, 1)}
            </span>
            <span className="text-[15px] font-semibold">{PLATFORM_NAME}</span>
          </Link>
          <Link href="/admin/login" className="text-[13px] text-primary hover:underline">
            Already registered? Sign in
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[6px] border border-line bg-surface p-6">
          <h1 className="text-[20px] font-semibold">Register your business</h1>
          <p className="mb-6 mt-1 text-[13px] text-muted">Set up your shop, its branches and your owner account. Takes about a minute.</p>
          <RegisterForm />
        </div>
        <aside className="space-y-4 text-[13px]">
          <section className="rounded-[6px] border border-line bg-surface p-4">
            <h2 className="font-semibold">What you get</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
              <li>QR / link ordering for guests at every outlet</li>
              <li>Menu with recipes; ingredient stock is deducted automatically</li>
              <li>Live orders board and 3D floor view</li>
              <li>Daily prep sheet, running costs and profit estimate</li>
            </ul>
          </section>
          <section className="rounded-[6px] border border-line bg-surface p-4">
            <h2 className="font-semibold">Branches</h2>
            <p className="mt-2 text-muted">
              Branches share one menu, ingredient list, settings and floor plan. Each branch has its own orders and stock. As the owner you see
              every branch from the headquarters overview and can switch into any branch.
            </p>
            <p className="mt-2 text-muted">You can add or close branches any time later.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
