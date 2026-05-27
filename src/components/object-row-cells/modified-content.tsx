import { formatFileTime } from "@/lib/format";
import type { S3Entry } from "@server/types";

export function ModifiedContent({
  entry,
  hideForPending,
}: {
  entry: S3Entry;
  hideForPending: boolean;
}) {
  if (hideForPending || entry.type === "prefix") return <>--</>;
  return <>{formatFileTime(entry.lastModified)}</>;
}
