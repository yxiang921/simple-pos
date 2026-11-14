import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/platform";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[4px] bg-primary text-[13px] font-semibold text-white">
            {PLATFORM_NAME.slice(0, 1)}
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">{PLATFORM_NAME}</p>
            <p className="text-[12px] text-muted">Merchant back office</p>
          </div>
        </div>
        <div className="rounded-[6px] border border-line bg-surface p-6">
          <h1 className="text-[17px] font-semibold">Sign in</h1>
          <p className="mb-5 mt-0.5 text-[13px] text-muted">Sign in with your business owner account.</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[13px] text-muted">
          New here?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Register your business
          </Link>
        </p>
      </div>
    </main>
  );
}
