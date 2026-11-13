"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[18px] font-semibold">Something went wrong</h1>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        The page could not be loaded. This is usually temporary — please try again.
        {error.digest && <span className="mt-1 block text-[12px]">Ref: {error.digest}</span>}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 h-9 rounded-[4px] bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover"
      >
        Try again
      </button>
    </main>
  );
}
