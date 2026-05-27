import { Loader2, XCircle } from "@/lib/icons";
import type { PendingInfo } from "@/stores/uploads";

/** Status glyph that replaces the checkbox while an upload is in flight.
 *  Uses currentColor so the wrapper's text-* class drives the hue. */
export function PendingBadge({ pending }: { pending: PendingInfo }) {
  if (pending.kind === "file") {
    if (pending.status === "failed") {
      return <XCircle className="text-destructive size-4" />;
    }
    if (pending.status === "paused") {
      return <Loader2 className="text-accent-peach size-4" />;
    }
    return <Loader2 className="text-primary-text size-4 animate-spin" />;
  }
  if (pending.anyFailed) {
    return <XCircle className="text-destructive size-4" />;
  }
  return <Loader2 className="text-primary-text size-4 animate-spin" />;
}
