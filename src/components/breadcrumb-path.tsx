import * as React from "react";
import { ArrowUp, FolderOpen } from "@/lib/icons";

import { cn } from "@/lib/utils";
import { prefixAtDepth, prefixSegments } from "@/lib/object-path";

/**
 * Terminal-style breadcrumb that always starts at the "Buckets" root. When
 * `bucket` is omitted, the row collapses to just the root crumb (used on the
 * home page so its chrome matches the in-bucket layout). When `bucket` is
 * set, segments inside `prefix` are appended after the bucket name.
 *
 * Up arrow navigates one level up:
 *   - on the home page: disabled
 *   - at the bucket root: navigates back to "/"
 *   - inside a folder: navigates to the parent prefix
 */
export function BreadcrumbPath({
  bucket,
  prefix = "",
  onNavigatePrefix,
  onNavigateHome,
  className,
}: {
  /** Omit to render the home-page crumb ("Buckets" only). */
  bucket?: string;
  /** Trailing-slash prefix or empty string for bucket root. Ignored when no bucket. */
  prefix?: string;
  /** Called with the prefix to navigate to (empty string = bucket root). */
  onNavigatePrefix?: (prefix: string) => void;
  /** Called when the user clicks the "Buckets" root or up-arrows past it. */
  onNavigateHome?: () => void;
  className?: string;
}) {
  const segments = React.useMemo(
    () => (bucket ? prefixSegments(prefix) : []),
    [bucket, prefix]
  );
  const atHome = !bucket;
  const atBucketRoot = !!bucket && segments.length === 0;

  const handleUp = () => {
    if (atHome) return;
    if (atBucketRoot) {
      onNavigateHome?.();
      return;
    }
    const parent = prefixAtDepth(segments, segments.length - 2);
    onNavigatePrefix?.(parent);
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-2 font-mono", className)}>
      <button
        type="button"
        onClick={handleUp}
        disabled={atHome}
        className="hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Up one level"
        title="Up one level"
      >
        <ArrowUp className="size-4" />
      </button>

      <div className="bg-input-bg border-border flex min-w-0 items-center rounded border px-3 py-1 text-xs">
        <FolderOpen className="text-muted-foreground mr-2 size-3.5 shrink-0" />

        {atHome ? (
          <span className="text-primary-text shrink-0 font-bold">Buckets</span>
        ) : (
          <button
            type="button"
            onClick={() => onNavigateHome?.()}
            className="text-foreground hover:text-primary-text shrink-0 font-bold focus:outline-none"
          >
            Buckets
          </button>
        )}

        {bucket && (
          <>
            <span className="text-muted-foreground mx-2 shrink-0">/</span>
            {atBucketRoot ? (
              <span className="text-primary-text truncate font-bold">{bucket}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigatePrefix?.("")}
                className="text-foreground hover:text-primary-text shrink-0 truncate focus:outline-none"
              >
                {bucket}
              </button>
            )}
          </>
        )}

        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1;
          const target = prefixAtDepth(segments, idx);
          return (
            <React.Fragment key={target}>
              <span className="text-muted-foreground mx-2 shrink-0">/</span>
              {isLast ? (
                <span className="text-primary-text truncate font-bold">
                  {segment}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigatePrefix?.(target)}
                  className="text-foreground hover:text-primary-text truncate focus:outline-none"
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
