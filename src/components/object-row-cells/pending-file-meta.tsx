import type { PendingInfo } from "@/stores/uploads";

export function PendingFileMeta({
  pending,
}: {
  pending: Extract<PendingInfo, { kind: "file" }>;
}) {
  if (pending.status === "queued") {
    return <span className="text-muted-foreground text-[10px] uppercase">Queued</span>;
  }
  if (pending.status === "paused") {
    return <span className="text-accent-peach text-[10px] uppercase">Paused</span>;
  }
  if (pending.indeterminate) {
    return <span className="text-primary-text text-[10px] uppercase">Uploading</span>;
  }
  const pct =
    pending.size > 0 ? (pending.bytesUploaded / pending.size) * 100 : 0;
  return (
    <span className="text-primary-text">{Math.min(100, pct).toFixed(0)}%</span>
  );
}
