import { formatBytes } from "@/lib/format";
import type { PendingInfo } from "@/stores/uploads";
import type { S3Entry } from "@server/types";

import { PendingFileMeta } from "@/components/object-row-cells/pending-file-meta";
import { PendingFolderMeta } from "@/components/object-row-cells/pending-folder-meta";

export function SizeContent({
  entry,
  pending,
  selected,
}: {
  entry: S3Entry;
  pending: PendingInfo | undefined;
  selected: boolean;
}) {
  if (pending?.kind === "file") return <PendingFileMeta pending={pending} />;
  if (pending?.kind === "folder")
    return <PendingFolderMeta pending={pending} />;
  if (entry.type === "prefix") {
    return <span className={selected ? "text-primary-text" : undefined}>--</span>;
  }
  return (
    <span className={selected ? "text-primary-text" : undefined}>
      {formatBytes(entry.size)}
    </span>
  );
}
