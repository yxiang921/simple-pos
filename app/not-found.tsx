import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-[13px] font-medium text-muted">404</p>
      <h1 className="mt-1 text-[18px] font-semibold">Page not found</h1>
      <p className="mt-1 text-[13px] text-muted">The page or order you are looking for does not exist.</p>
      <Link href="/" className="mt-5 text-[14px] font-medium text-primary hover:underline">
        Go to the home page
      </Link>
    </main>
  );
}
