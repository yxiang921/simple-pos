export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading menu">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-line bg-surface px-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded-[3px] bg-hover" />
            <div className="h-3 w-3/4 animate-pulse rounded-[3px] bg-hover" />
            <div className="h-4 w-16 animate-pulse rounded-[3px] bg-hover" />
          </div>
          <div className="size-[92px] animate-pulse rounded-[4px] bg-hover" />
        </div>
      ))}
    </div>
  );
}
