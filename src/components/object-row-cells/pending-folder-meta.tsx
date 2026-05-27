import type { PendingInfo } from "@/stores/uploads";

export function PendingFolderMeta({
  pending,
}: {
  pending: Extract<PendingInfo, { kind: "folder" }>;
}) {
  return (
    <span className="text-muted-foreground text-[10px] uppercase">
      {pending.fileCount} file{pending.fileCount === 1 ? "" : "s"}
    </span>
  );
}
