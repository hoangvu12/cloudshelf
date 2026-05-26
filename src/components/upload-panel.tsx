import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  ArrowUp,
  CheckCircle2,
  CheckIcon,
  CloudUpload,
  CornerDownRight,
  Link as LinkIcon,
  Maximize2,
  Minus,
  Pause,
  Play,
  RotateCw,
  X,
  XCircle,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { fileAppearance } from "@/lib/file-types";
import { trimTrailingSlash } from "@/lib/object-path";
import { fetchDownloadUrl } from "@/lib/api/objects";
import { useCopied } from "@/lib/use-copied";
import {
  useUploadItem,
  useUploadsStore,
  type UploadItem,
} from "@/stores/uploads";

/**
 * Floating bottom-right upload panel. Lives once at the app root so uploads
 * survive navigation between buckets. Mounts nothing when there are no
 * uploads.
 *
 * Re-render strategy:
 *   - This component subscribes to a *summary* (counts + ordered ids), so a
 *     progress tick only re-renders the affected row, not the whole panel.
 *   - Each row subscribes to its own item via `useUploadItem(id)` — same
 *     per-row subscription pattern as the file browser's selection.
 */
export function UploadPanel() {
  // CRITICAL: the selector must return a value that's shallow-equal across
  // store updates when nothing relevant changed — otherwise useSyncExternalStore
  // (Zustand v5's backbone) sees a new snapshot every render and React aborts
  // with "Maximum update depth exceeded." We return only primitives + `order`
  // (referentially stable when its contents don't change), all at the top level
  // so `useShallow` can Object.is each one and bail out when appropriate.
  const data = useUploadsStore(
    useShallow((s) => {
      let done = 0;
      let active = 0;
      let queued = 0;
      let failed = 0;
      let canceled = 0;
      let paused = 0;
      // Counts only multipart items that pauseAll/resumeAll can act on, so
      // the footer buttons stay disabled when they'd be no-ops.
      let pausable = 0;
      let resumable = 0;
      let totalBytes = 0;
      let uploadedBytes = 0;
      for (const id of s.order) {
        const it = s.items[id];
        if (!it) continue;
        totalBytes += it.size;
        uploadedBytes += it.bytesUploaded;
        switch (it.status) {
          case "completed":
            done += 1;
            break;
          case "uploading":
            active += 1;
            if (it.strategy === "multipart") pausable += 1;
            break;
          case "queued":
            queued += 1;
            if (it.strategy === "multipart") pausable += 1;
            break;
          case "paused":
            paused += 1;
            resumable += 1;
            break;
          case "failed":
            failed += 1;
            break;
          case "canceled":
            canceled += 1;
            break;
        }
      }
      return {
        order: s.order,
        done,
        active,
        queued,
        failed,
        canceled,
        paused,
        pausable,
        resumable,
        totalBytes,
        uploadedBytes,
      };
    })
  );
  const actions = useUploadsStore((s) => s.actions);
  const [minimized, setMinimized] = React.useState(false);

  if (data.order.length === 0) return null;

  const totalProgress =
    data.totalBytes > 0 ? (data.uploadedBytes / data.totalBytes) * 100 : 0;
  const finishedCount = data.done + data.canceled + data.failed;
  const inFlightCount = data.active + data.queued;
  // "All done" should not count paused — those still need user action.
  const allDone = inFlightCount === 0 && data.paused === 0 && data.done > 0;

  if (minimized) {
    return (
      <MinimizedPanel
        onExpand={() => setMinimized(false)}
        active={data.active}
        queued={data.queued}
        total={data.order.length}
        progress={totalProgress}
        allDone={allDone}
      />
    );
  }

  return (
    <div className="themed-scope pointer-events-none fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-[28rem] md:max-w-[32rem]">
      <div className="bg-background/95 border-surface-1 text-foreground pointer-events-auto flex flex-col overflow-hidden rounded-xl border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out">
        <Header
          done={data.done}
          active={data.active}
          queued={data.queued}
          paused={data.paused}
          failed={data.failed}
          allDone={allDone}
          onMinimize={() => setMinimized(true)}
          onClose={actions.cancelAll}
        />

        <div className="bg-background/50 flex max-h-[60vh] flex-col overflow-y-auto">
          {data.order.map((id) => (
            <UploadRow key={id} id={id} />
          ))}
        </div>

        <Footer
          inFlightCount={inFlightCount}
          finishedCount={finishedCount}
          pausable={data.pausable}
          resumable={data.resumable}
          onClearFinished={actions.clearFinished}
          onCancelAll={actions.cancelAll}
          onPauseAll={actions.pauseAll}
          onResumeAll={actions.resumeAll}
        />
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  done,
  active,
  queued,
  paused,
  failed,
  allDone,
  onMinimize,
  onClose,
}: {
  done: number;
  active: number;
  queued: number;
  paused: number;
  failed: number;
  allDone: boolean;
  onMinimize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-card/90 border-surface-1 flex h-12 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <CloudUpload className="text-primary-text size-4" />
        <span className="text-foreground text-sm font-medium">Transfers</span>
      </div>
      <div className="flex items-center gap-4">
        <StatusSummary
          done={done}
          active={active}
          queued={queued}
          paused={paused}
          failed={failed}
        />
        <div className="bg-surface-1 h-4 w-px" />
        <div className="flex items-center gap-2">
          <IconButton
            onClick={onMinimize}
            title="Minimize"
            className="hover:text-foreground hover:bg-muted"
          >
            <Minus className="size-3.5" />
          </IconButton>
          <IconButton
            onClick={onClose}
            title={allDone ? "Dismiss" : "Cancel all & dismiss"}
            className="hover:text-destructive hover:bg-destructive/10"
          >
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function StatusSummary({
  done,
  active,
  queued,
  paused,
  failed,
}: {
  done: number;
  active: number;
  queued: number;
  paused: number;
  failed: number;
}) {
  const parts: React.ReactNode[] = [];
  if (done > 0) parts.push(<span key="d" className="text-success">{done} done</span>);
  if (active > 0) parts.push(<span key="a" className="text-primary-text">{active} active</span>);
  if (queued > 0) parts.push(<span key="q" className="text-muted-foreground">{queued} queued</span>);
  if (paused > 0) parts.push(<span key="p" className="text-accent-yellow">{paused} paused</span>);
  if (failed > 0) parts.push(<span key="f" className="text-destructive">{failed} failed</span>);
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px]">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-surface-2">·</span>}
          {p}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer({
  inFlightCount,
  finishedCount,
  pausable,
  resumable,
  onClearFinished,
  onCancelAll,
  onPauseAll,
  onResumeAll,
}: {
  inFlightCount: number;
  finishedCount: number;
  pausable: number;
  resumable: number;
  onClearFinished: () => void;
  onCancelAll: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
}) {
  return (
    <div className="bg-card/90 border-surface-1 flex shrink-0 items-center justify-between gap-2 border-t p-3">
      <TuiButton
        onClick={onClearFinished}
        disabled={finishedCount === 0}
        color="subtext"
      >
        Clear Completed
      </TuiButton>
      <div className="flex items-center gap-2">
        {resumable > 0 && (
          <TuiButton onClick={onResumeAll} color="peach">
            Resume All
          </TuiButton>
        )}
        {pausable > 0 && (
          <TuiButton onClick={onPauseAll} color="peach">
            Pause All
          </TuiButton>
        )}
        {inFlightCount > 0 && (
          <TuiButton onClick={onCancelAll} color="red">
            Cancel All
          </TuiButton>
        )}
      </div>
    </div>
  );
}

// ─── Row icon / thumbnail ────────────────────────────────────────────────────

/** Renders the small left-side glyph for an upload row. When @uppy/thumbnail-
 *  generator has produced a data-URL preview for an image file we show that;
 *  everything else falls back to the file-type icon. Size is fixed at 20px so
 *  layouts in every row variant stay aligned. */
function RowIcon({
  item,
  className,
}: {
  item: UploadItem;
  className?: string;
}) {
  const { Icon, color } = fileAppearance(item.fileName);
  if (item.preview) {
    return (
      <img
        src={item.preview}
        alt=""
        className={cn(
          "border-surface-1 size-5 shrink-0 rounded-sm border object-cover",
          className
        )}
      />
    );
  }
  return <Icon className={cn("size-5 shrink-0", color, className)} />;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function UploadRow({ id }: { id: string }) {
  const item = useUploadItem(id);
  const actions = useUploadsStore((s) => s.actions);
  if (!item) return null;

  const wrapperClasses = cn(
    "group border-border hover:bg-muted/30 border-b p-4 transition-colors",
    item.status === "failed" && "bg-destructive/5",
    item.status === "canceled" && "opacity-60"
  );

  switch (item.status) {
    case "uploading":
      return (
        <div className={wrapperClasses}>
          <UploadingRow
            item={item}
            onCancel={() => actions.cancel(id)}
            onPause={() => actions.pause(id)}
          />
        </div>
      );
    case "queued":
      return (
        <div className={wrapperClasses}>
          <CompactRow
            item={item}
            right={
              <>
                <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                  Queued
                </span>
                <IconButton
                  onClick={() => actions.cancel(id)}
                  title="Cancel"
                  className="hover:text-destructive hover:bg-surface-1"
                >
                  <X className="size-3.5" />
                </IconButton>
              </>
            }
          />
        </div>
      );
    case "paused":
      return (
        <div className={wrapperClasses}>
          <PausedRow
            item={item}
            onResume={() => actions.resume(id)}
            onCancel={() => actions.cancel(id)}
          />
        </div>
      );
    case "completed":
      return (
        <div className={wrapperClasses}>
          <CompletedRow item={item} />
        </div>
      );
    case "failed":
      return (
        <div className={wrapperClasses}>
          <FailedRow
            item={item}
            onRetry={() => actions.retry(id)}
            onCancel={() => actions.cancel(id)}
          />
        </div>
      );
    case "canceled":
      return (
        <div className={wrapperClasses}>
          <CompactRow
            item={item}
            right={
              <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                Canceled
              </span>
            }
          />
        </div>
      );
  }
}

function UploadingRow({
  item,
  onCancel,
  onPause,
}: {
  item: UploadItem;
  onCancel: () => void;
  onPause: () => void;
}) {
  const pct = item.size > 0 ? (item.bytesUploaded / item.size) * 100 : 0;
  // Pause is only meaningful for multipart — single-PUT can't resume.
  const canPause = item.strategy === "multipart";
  return (
    <>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-3 overflow-hidden pr-2">
          <RowIcon item={item} className="mt-0.5" />
          <div className="min-w-0">
            <div
              className="text-foreground truncate text-sm font-medium"
              title={item.fileName}
            >
              {item.fileName}
            </div>
            <MetaLine item={item} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canPause && (
            <IconButton
              onClick={onPause}
              title="Pause"
              className="hover:text-accent-peach hover:bg-surface-1"
            >
              <Pause className="size-3.5" />
            </IconButton>
          )}
          <IconButton
            onClick={onCancel}
            title="Cancel"
            className="hover:text-destructive hover:bg-surface-1"
          >
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div>
        <div className="bg-muted mb-2 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary-text relative h-full rounded-full shadow-[0_0_10px_color-mix(in_oklab,_var(--primary-text)_40%,_transparent)] transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px]">
          <div className="text-primary-text font-bold">
            {pct.toFixed(0)}%
            <span className="text-muted-foreground ml-1 font-normal">
              · {formatBytes(item.bytesUploaded)} of {formatBytes(item.size)}
            </span>
          </div>
          <div className="text-muted-foreground">
            {item.speedBps > 0 ? (
              <>
                {formatSpeed(item.speedBps)}
                {item.etaSeconds != null &&
                  Number.isFinite(item.etaSeconds) &&
                  item.etaSeconds < 24 * 3600 && (
                    <>
                      {" · "}
                      <span className="text-foreground">
                        {formatEta(item.etaSeconds)} left
                      </span>
                    </>
                  )}
              </>
            ) : (
              <span className="text-accent-peach">Stalled · retrying…</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CompletedRow({ item }: { item: UploadItem }) {
  const [copying, setCopying] = React.useState(false);
  const [copied, flashCopied] = useCopied();
  const handleCopyLink = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const { url } = await fetchDownloadUrl(
        item.connectionId,
        item.bucket,
        item.key
      );
      await navigator.clipboard.writeText(url);
      flashCopied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy link");
    } finally {
      setCopying(false);
    }
  };
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 overflow-hidden pr-2">
        <div className="relative shrink-0">
          <RowIcon item={item} />
          <div className="bg-background absolute -bottom-1 -right-1 rounded-full">
            <CheckCircle2 className="text-success fill-success/20 size-3.5" />
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-foreground decoration-surface-2 truncate text-sm font-medium line-through"
            title={item.fileName}
          >
            {item.fileName}
          </div>
          <MetaLine item={item} />
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 pl-2 transition-opacity",
          copied
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <button
          type="button"
          onClick={handleCopyLink}
          disabled={copying}
          className={cn(
            "hover:bg-surface-1 flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs transition-colors disabled:opacity-50",
            copied
              ? "text-success"
              : "text-muted-foreground hover:text-accent-blue"
          )}
        >
          {copied ? (
            <CheckIcon className="size-3" />
          ) : (
            <LinkIcon className="size-3" />
          )}
          {copied ? "Copied" : copying ? "Copying..." : "Copy Link"}
        </button>
      </div>
    </div>
  );
}

function PausedRow({
  item,
  onResume,
  onCancel,
}: {
  item: UploadItem;
  onResume: () => void;
  onCancel: () => void;
}) {
  const pct = item.size > 0 ? (item.bytesUploaded / item.size) * 100 : 0;
  return (
    <>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-3 overflow-hidden pr-2">
          <RowIcon item={item} className="mt-0.5" />
          <div className="min-w-0">
            <div
              className="text-foreground truncate text-sm font-medium"
              title={item.fileName}
            >
              {item.fileName}
            </div>
            <MetaLine item={item} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            onClick={onResume}
            title="Resume"
            className="hover:text-success hover:bg-surface-1"
          >
            <Play className="size-3.5" />
          </IconButton>
          <IconButton
            onClick={onCancel}
            title="Cancel"
            className="hover:text-destructive hover:bg-surface-1"
          >
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div>
        <div className="bg-muted mb-2 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary-text h-full rounded-full shadow-[0_0_10px_color-mix(in_oklab,_var(--primary-text)_40%,_transparent)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px]">
          <div className="text-primary-text font-bold">
            {pct.toFixed(0)}%
            <span className="text-muted-foreground ml-1 font-normal">
              · {formatBytes(item.bytesUploaded)} of {formatBytes(item.size)}
            </span>
          </div>
          <span className="text-accent-peach tracking-wider uppercase">
            Paused
          </span>
        </div>
      </div>
    </>
  );
}

function FailedRow({
  item,
  onRetry,
  onCancel,
}: {
  item: UploadItem;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 overflow-hidden pr-2">
        <div className="relative shrink-0">
          <RowIcon item={item} />
          <div className="bg-background absolute -bottom-1 -right-1 rounded-full">
            <XCircle className="text-destructive fill-destructive/20 size-3.5" />
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-foreground truncate text-sm font-medium"
            title={item.fileName}
          >
            {item.fileName}
          </div>
          <div
            className="text-destructive mt-0.5 truncate font-mono text-[10px]"
            title={item.lastError}
          >
            Failed: {item.lastError ?? "Upload error"}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pl-2">
        <IconButton
          onClick={onRetry}
          title="Retry"
          className="hover:text-foreground hover:bg-surface-1"
        >
          <RotateCw className="size-3.5" />
        </IconButton>
        <IconButton
          onClick={onCancel}
          title="Dismiss"
          className="hover:text-destructive hover:bg-surface-1"
        >
          <X className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function CompactRow({
  item,
  right,
}: {
  item: UploadItem;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 overflow-hidden pr-2">
        <RowIcon item={item} />
        <div className="min-w-0">
          <div
            className="text-foreground truncate text-sm font-medium"
            title={item.fileName}
          >
            {item.fileName}
          </div>
          <div className="mt-0.5">
            <MetaLine item={item} inline />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-2">{right}</div>
    </div>
  );
}

/** TYPE · size · ↳ destination — the standard metadata sub-line shown under
 *  the filename on every row that has room for it. Consolidates what used to
 *  be just the destination, so users can see the file type ("JPEG", "MP4")
 *  and total size at a glance in any state. */
function MetaLine({ item, inline = false }: { item: UploadItem; inline?: boolean }) {
  const { label } = fileAppearance(item.fileName);
  const path = trimTrailingSlash(item.prefix);
  const display = path ? `${item.bucket}/${path}` : item.bucket;
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 truncate font-mono text-[10px]",
        !inline && "mt-1"
      )}
      title={display}
    >
      <span>{label}</span>
      <span className="text-surface-2">·</span>
      <span>{formatBytes(item.size)}</span>
      <span className="text-surface-2">·</span>
      <CornerDownRight className="size-3 shrink-0" />
      <span className="truncate">{display}</span>
    </div>
  );
}

// ─── Minimized pill ──────────────────────────────────────────────────────────

function MinimizedPanel({
  onExpand,
  active,
  queued,
  total,
  progress,
  allDone,
}: {
  onExpand: () => void;
  active: number;
  queued: number;
  total: number;
  progress: number;
  allDone: boolean;
}) {
  const circumference = 2 * Math.PI * 10;
  const dashOffset = circumference * (1 - progress / 100);
  const label = allDone
    ? `All ${total} uploaded`
    : `Uploading ${active} of ${active + queued}`;
  return (
    <div className="themed-scope pointer-events-none fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={onExpand}
        className="bg-background/95 border-surface-1 hover:border-muted-foreground text-foreground pointer-events-auto flex w-full items-center gap-3 rounded-full border px-4 py-2 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-colors animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out sm:w-72"
      >
        <div className="relative flex size-6 shrink-0 items-center justify-center">
          <svg className="size-6 -rotate-90" viewBox="0 0 24 24">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              className="text-surface-1"
            />
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className={cn(
                "transition-[stroke-dashoffset] duration-200 ease-linear",
                allDone ? "text-success" : "text-primary-text"
              )}
            />
          </svg>
          {allDone ? (
            <CheckCircle2 className="text-success absolute size-3" />
          ) : (
            <ArrowUp className="text-primary-text absolute size-3" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="truncate">{label}</span>
            <span
              className={cn(
                "font-mono text-[10px] font-bold",
                allDone ? "text-success" : "text-primary-text"
              )}
            >
              {progress.toFixed(0)}%
            </span>
          </div>
          <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200 ease-linear",
                allDone ? "bg-success" : "bg-primary-text"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="border-surface-1 text-muted-foreground flex shrink-0 items-center gap-1 border-l pl-2">
          <Maximize2 className="size-3.5" />
        </div>
      </button>
    </div>
  );
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function IconButton({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "text-muted-foreground rounded p-1 transition-colors focus:outline-none",
        className
      )}
    >
      {children}
    </button>
  );
}

function TuiButton({
  onClick,
  disabled,
  color,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: "red" | "peach" | "subtext";
  children: React.ReactNode;
}) {
  const colorClass =
    color === "red"
      ? "text-destructive"
      : color === "peach"
        ? "text-accent-peach"
        : "text-muted-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-surface-1 hover:border-muted-foreground hover:bg-muted rounded border bg-transparent px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-40 disabled:hover:border-surface-1 disabled:hover:bg-transparent",
        colorClass
      )}
    >
      {children}
    </button>
  );
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "— /s";
  return `${formatBytes(bps)}/s`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds - m * 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
