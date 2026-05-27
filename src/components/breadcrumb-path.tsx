import * as React from "react";
import { ArrowLeft, ArrowRight, Database } from "@/lib/icons";

import { cn } from "@/lib/utils";
import { useNavHistory } from "@/lib/nav-history";
import { prefixAtDepth, prefixSegments } from "@/lib/object-path";

/**
 * Terminal-style breadcrumb that always starts at the "Buckets" root. When
 * `bucket` is omitted, the row collapses to just the root crumb (used on the
 * home page so its chrome matches the in-bucket layout). When `bucket` is
 * set, segments inside `prefix` are appended after the bucket name.
 *
 * Left/right arrows act like a browser's back/forward: they walk the in-app
 * navigation history tracked by `useNavHistory`, not the breadcrumb tree. To
 * jump up one level by hierarchy, click an ancestor segment directly.
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
  /** Called when the user clicks the "Buckets" root. */
  onNavigateHome?: () => void;
  className?: string;
}) {
  const segments = React.useMemo(
    () => (bucket ? prefixSegments(prefix) : []),
    [bucket, prefix]
  );
  const atHome = !bucket;
  const atBucketRoot = !!bucket && segments.length === 0;

  const { canBack, canForward, back, forward } = useNavHistory();

  return (
    <div className={cn("flex min-w-0 items-center gap-2 font-mono", className)}>
      <div className="flex shrink-0 items-center gap-0.5">
        <NavArrowButton
          direction="back"
          disabled={!canBack}
          onClick={back}
        />
        <NavArrowButton
          direction="forward"
          disabled={!canForward}
          onClick={forward}
        />
      </div>

      <div className="bg-input-bg border-border flex min-w-0 items-center rounded border px-3 py-1 text-xs">
        <Database className="mr-2 size-3.5 shrink-0 text-yellow-300" />

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

function NavArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "back" ? ArrowLeft : ArrowRight;
  const label = direction === "back" ? "Back" : "Forward";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" />
    </button>
  );
}
