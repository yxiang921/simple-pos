import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/platform";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { Building2, Package, QrCode, Radio } from "lucide-react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register your business" };

export default async function RegisterPage() {
  if (await getCurrentAdmin()) redirect("/admin/dashboard");
  return (
    <main className="min-h-dvh">
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{PLATFORM_NAME}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/admin/login" className="press inline-flex h-8 items-center rounded-full px-3 text-[13px] text-primary hover:bg-primary-soft">
              Already registered? Sign in
            </Link>
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
          </div>
        </div>
      </header>
      <div className="relative">
        <div className="hero-light" aria-hidden />
      </div>
      <div className="relative mx-auto max-w-5xl px-5 pb-6 pt-12 text-center">
        <h1 className="animate-fade-up text-[38px] font-bold tracking-[-0.04em] sm:text-[48px]">
          Open your shop <span className="text-gradient">in a minute.</span>
        </h1>
        <p className="animate-fade-up mx-auto mt-3 max-w-xl text-[17px] text-muted [animation-delay:0.05s]">
          Set up your business, its branches and your owner account.
        </p>
      </div>
      <div className="relative mx-auto grid max-w-5xl gap-6 px-5 pb-16 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card shadow-pop animate-fade-up rounded-[26px] p-6 [animation-delay:0.1s] sm:p-8">
          <RegisterForm />
        </div>
        <aside className="stagger space-y-3 text-[13px]">
          {[
            { icon: <QrCode />, t: "QR ordering", d: "A guest link for every outlet and table." },
            { icon: <Package />, t: "Exact stock", d: "Recipes deduct ingredients at the right branch, automatically." },
            { icon: <Building2 />, t: "Branches", d: "One shared menu; separate orders and stock. See all from the HQ view." },
            { icon: <Radio />, t: "Live", d: "Orders, floor and stock update by themselves." },
          ].map((f) => (
            <div key={f.t} className="card spotlight flex gap-3 rounded-[18px] p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-soft text-primary [&_svg]:size-[18px]">{f.icon}</span>
              <span>
                <span className="block text-[14px] font-semibold tracking-[-0.01em]">{f.t}</span>
                <span className="mt-0.5 block leading-relaxed text-muted">{f.d}</span>
              </span>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
