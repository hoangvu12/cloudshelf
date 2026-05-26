import * as React from "react";
import { ArrowUp, FolderOpen } from "@/lib/icons";

import { cn } from "@/lib/utils";
import { prefixAtDepth, prefixSegments } from "@/lib/object-path";

/**
 * Terminal-style breadcrumb: bucket name in green → mid segments in mauve-hover
 * → current segment bold mauve. Up arrow on the left navigates to parent.
 * Each segment is independently clickable and routes to its prefix.
 */
export function BreadcrumbPath({
  bucket,
  prefix,
  onNavigate,
  className,
}: {
  bucket: string;
  /** Trailing-slash prefix or empty string for bucket root. */
  prefix: string;
  /** Called with the prefix to navigate to (empty string = bucket root). */
  onNavigate: (prefix: string) => void;
  className?: string;
}) {
  const segments = React.useMemo(() => prefixSegments(prefix), [prefix]);
  const parent = segments.length > 0 ? prefixAtDepth(segments, segments.length - 2) : "";
  const atRoot = segments.length === 0;

  return (
    <div className={cn("flex min-w-0 items-center gap-2 font-mono", className)}>
      <button
        type="button"
        onClick={() => onNavigate(parent)}
        disabled={atRoot}
        className="hover:bg-ctp-surface0 text-ctp-subtext hover:text-ctp-text rounded p-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Up one level"
        title="Up one level"
      >
        <ArrowUp className="size-4" />
      </button>

      <div className="bg-ctp-crust border-ctp-surface0 flex min-w-0 items-center rounded border px-3 py-1 text-xs">
        <FolderOpen className="text-ctp-mauve mr-2 size-3.5 shrink-0" />
        <button
          type="button"
          onClick={() => onNavigate("")}
          className={cn(
            "text-ctp-green shrink-0 font-bold hover:opacity-80 focus:outline-none",
            atRoot && "cursor-default opacity-100"
          )}
        >
          {bucket}
        </button>

        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1;
          const target = prefixAtDepth(segments, idx);
          return (
            <React.Fragment key={target}>
              <span className="text-ctp-surface1 mx-2 shrink-0">/</span>
              {isLast ? (
                <span className="text-ctp-mauve truncate font-bold">
                  {segment}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(target)}
                  className="text-ctp-text hover:text-ctp-mauve truncate focus:outline-none"
                >
                  {segment}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
