import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="animate-fade-up text-gradient text-[96px] font-bold leading-none tracking-[-0.06em]">404</p>
      <h1 className="animate-fade-up mt-3 text-[24px] font-semibold tracking-[-0.025em] [animation-delay:0.05s]">Page not found</h1>
      <p className="animate-fade-up mt-1.5 text-[14px] text-muted [animation-delay:0.1s]">The page or order you are looking for does not exist.</p>
      <Link
        href="/"
        className="press btn-primary animate-fade-up mt-7 inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-white [animation-delay:0.15s] hover:bg-primary-hover"
      >
        Go to the home page
      </Link>
    </main>
  );
}
