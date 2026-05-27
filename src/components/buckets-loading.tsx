export function BucketsLoading() {
  return (
    <div className="flex-1 space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-muted/40 h-9 animate-pulse rounded-md"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
