export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-5 h-6 w-40 animate-pulse rounded-[4px] bg-line" />
      <div className="rounded-[6px] border border-line bg-surface">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <div className="h-4 w-1/4 animate-pulse rounded-[3px] bg-hover" />
            <div className="h-4 w-1/3 animate-pulse rounded-[3px] bg-hover" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded-[3px] bg-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}
