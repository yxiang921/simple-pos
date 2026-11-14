"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <div className="card shadow-pop animate-pop max-w-sm rounded-[24px] px-7 py-8">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-[22px] font-bold text-danger">!</span>
        <h1 className="text-[19px] font-semibold tracking-[-0.02em]">Something went wrong</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          The page could not be loaded. This is usually temporary — please try again.
          {error.digest && <span className="mt-1 block text-[12px]">Ref: {error.digest}</span>}
        </p>
        <button
          type="button"
          onClick={reset}
          className="press btn-primary mt-5 h-10 rounded-full bg-primary px-5 text-[14px] font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
