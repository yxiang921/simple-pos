import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/platform";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin/dashboard");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="animate-fade-up w-full max-w-[400px]">
        <Link href="/" className="mx-auto mb-7 flex w-fit flex-col items-center gap-3 text-center">
          <BrandMark size={56} />
          <span>
            <span className="block text-[13px] font-medium text-muted">{PLATFORM_NAME}</span>
            <span className="block text-[26px] font-bold tracking-[-0.03em]">Welcome back.</span>
          </span>
        </Link>
        <div className="card shadow-pop rounded-[24px] p-7">
          <h1 className="text-[17px] font-semibold tracking-[-0.015em]">Sign in</h1>
          <p className="mb-5 mt-0.5 text-[13px] text-muted">Use your business owner account.</p>
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-[13px] text-muted">
          New here?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Register your business
          </Link>
        </p>
      </div>
    </main>
  );
}
