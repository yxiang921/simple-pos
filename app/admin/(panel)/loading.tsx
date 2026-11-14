export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-3 h-8 w-56 rounded-[10px]" />
      <div className="skeleton mb-6 h-4 w-96 max-w-full rounded-full" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-[104px] rounded-[18px] p-4">
            <div className="skeleton h-3 w-24 rounded-full" />
            <div className="skeleton mt-4 h-7 w-20 rounded-[8px]" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden rounded-[18px]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
            <div className="skeleton h-4 w-1/4 rounded-full" />
            <div className="skeleton h-4 w-1/3 rounded-full" />
            <div className="skeleton ml-auto h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
