export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-3 pt-4 sm:px-4" aria-busy="true" aria-label="Loading menu">
      <div className="skeleton mb-3 h-7 w-40 rounded-[10px]" />
      <div className="card overflow-hidden rounded-[22px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-4 last:border-b-0">
            <div className="flex-1 space-y-2.5">
              <div className="skeleton h-4 w-1/2 rounded-full" />
              <div className="skeleton h-3 w-3/4 rounded-full" />
              <div className="skeleton h-4 w-16 rounded-full" />
            </div>
            <div className="skeleton size-[104px] rounded-[18px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
