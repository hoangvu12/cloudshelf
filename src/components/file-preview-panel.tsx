import * as React from "react";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  Link as LinkIcon,
  Loader2,
  X,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes, formatFileTime } from "@/lib/format";
import { fileAppearance, previewKind, type PreviewKind } from "@/lib/file-types";
import {
  highlightToTokens,
  shikiLangFor,
  type ThemedToken,
} from "@/lib/highlighter";
import { basename } from "@/lib/object-path";
import { fetchDownloadUrl, usePreviewUrl } from "@/lib/api/objects";
import { useObjects } from "@/lib/api/objects";
import { usePreviewStore } from "@/stores/preview";
import { useCopied } from "@/lib/use-copied";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { S3ObjectEntry } from "@server/types";

/** Cap how much of a text/code file we'll pull down for inline preview. */
const TEXT_PREVIEW_BYTES = 512 * 1024;

/**
 * Right-side file preview. Renders a thin chrome (header, prev/next, actions)
 * plus a body that switches on file kind. The entry is looked up in the
 * currently-loaded object list; if the user navigates past the loaded pages
 * via prev/next the panel falls back to URL-only mode (name from the key,
 * no size/modified).
 */
export function FilePreviewPanel({
  connectionId,
  bucket,
  prefix,
}: {
  connectionId: string;
  bucket: string;
  prefix: string;
}) {
  const { openKey, siblings, close, next, prev } = usePreviewStore();
  const query = useObjects(connectionId, bucket, prefix);

  const entry = React.useMemo<S3ObjectEntry | null>(() => {
    if (!openKey || !query.data) return null;
    for (const page of query.data.pages) {
      for (const e of page.entries) {
        if (e.type === "object" && e.key === openKey) return e;
      }
    }
    return null;
  }, [openKey, query.data]);

  React.useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey, close, next, prev]);

  const [copied, flashCopied] = useCopied();

  if (!openKey) return null;

  const name = basename(openKey);
  const { Icon, color, label } = fileAppearance(name);
  const kind = previewKind(name);
  const idx = siblings.indexOf(openKey);
  const hasNav = idx !== -1 && siblings.length > 1;
  const counter = hasNav ? `${idx + 1} of ${siblings.length}` : null;
  const atFirst = idx <= 0;
  const atLast = idx === -1 || idx === siblings.length - 1;

  const handleDownload = async () => {
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, openKey);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handleOpen = async () => {
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, openKey);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open file");
    }
  };

  const handleCopyLink = async () => {
    try {
      const { url } = await fetchDownloadUrl(connectionId, bucket, openKey);
      await navigator.clipboard.writeText(url);
      flashCopied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy link");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Icon className={cn("size-4 shrink-0", color)} />
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-sm font-medium" title={name}>
            {name}
          </div>
        </div>
        <IconBtn aria-label="Previous" disabled={!hasNav || atFirst} onClick={prev}>
          <ChevronLeft className="size-4" />
        </IconBtn>
        <IconBtn aria-label="Next" disabled={!hasNav || atLast} onClick={next}>
          <ChevronRight className="size-4" />
        </IconBtn>
        <IconBtn aria-label="Close preview" onClick={close}>
          <X className="size-4" />
        </IconBtn>
      </header>

      <div className="border-border text-muted-foreground flex shrink-0 items-center justify-between border-b px-3 py-2 font-mono text-[10px] uppercase">
        <span>{label}</span>
        {counter && <span>{counter}</span>}
      </div>

      <PreviewBody
        connectionId={connectionId}
        bucket={bucket}
        objectKey={openKey}
        name={name}
        kind={kind}
        entry={entry}
      />

      <footer className="border-border flex shrink-0 gap-1 border-t p-2">
        <ActionBtn icon={<Download className="size-3.5" />} onClick={handleDownload}>
          Download
        </ActionBtn>
        <ActionBtn
          icon={
            copied ? (
              <CheckIcon className="text-success size-3.5" />
            ) : (
              <LinkIcon className="size-3.5" />
            )
          }
          onClick={handleCopyLink}
          className={copied ? "text-success" : undefined}
        >
          {copied ? "Copied" : "Copy link"}
        </ActionBtn>
        <ActionBtn icon={<ExternalLink className="size-3.5" />} onClick={handleOpen}>
          Open
        </ActionBtn>
      </footer>
    </div>
  );
}

/**
 * Below `lg:` only. At desktop widths the inline panel in AppShell handles
 * preview, and we unmount this entirely so vaul doesn't portal an overlay
 * scrim over the page.
 */
export function FilePreviewDrawer({
  connectionId,
  bucket,
  prefix,
}: {
  connectionId: string;
  bucket: string;
  prefix: string;
}) {
  const openKey = usePreviewStore((s) => s.openKey);
  const close = usePreviewStore((s) => s.close);
  const isNarrow = useIsNarrowViewport();

  if (!isNarrow) return null;

  return (
    <Drawer
      direction="bottom"
      open={!!openKey}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DrawerContent className="h-[88vh] max-h-[88vh]">
        <DrawerTitle className="sr-only">File preview</DrawerTitle>
        <FilePreviewPanel
          connectionId={connectionId}
          bucket={bucket}
          prefix={prefix}
        />
      </DrawerContent>
    </Drawer>
  );
}

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return narrow;
}

function PreviewBody({
  connectionId,
  bucket,
  objectKey,
  name,
  kind,
  entry,
}: {
  connectionId: string;
  bucket: string;
  objectKey: string;
  name: string;
  kind: PreviewKind;
  entry: S3ObjectEntry | null;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PreviewMedia
        connectionId={connectionId}
        bucket={bucket}
        objectKey={objectKey}
        name={name}
        kind={kind}
        size={entry?.size}
      />

      <dl className="divide-border divide-y font-mono text-[11px]">
        <Row label="Name" value={name} />
        <Row label="Size" value={entry ? formatBytes(entry.size) : "-"} />
        <Row
          label="Modified"
          value={entry ? formatFileTime(entry.lastModified) : "-"}
        />
        <Row label="Key" value={entry?.key ?? objectKey} />
        {entry?.etag && <Row label="ETag" value={entry.etag} />}
        {entry?.storageClass && <Row label="Storage" value={entry.storageClass} />}
      </dl>
    </div>
  );
}

function PreviewMedia({
  connectionId,
  bucket,
  objectKey,
  name,
  kind,
  size,
}: {
  connectionId: string;
  bucket: string;
  objectKey: string;
  name: string;
  kind: PreviewKind;
  size: number | undefined;
}) {
  // Skip URL fetch entirely for unsupported kinds.
  const enabled = kind !== "unsupported";
  const urlQuery = usePreviewUrl(
    enabled ? connectionId : null,
    enabled ? bucket : null,
    enabled ? objectKey : null
  );

  if (kind === "unsupported") {
    return (
      <MediaShell>
        <FileQuestion className="size-10" />
        <span className="font-mono text-[11px]">Preview not available</span>
      </MediaShell>
    );
  }

  if (urlQuery.isPending) {
    return (
      <MediaShell>
        <Loader2 className="size-6 animate-spin" />
        <span className="font-mono text-[10px]">Loading preview...</span>
      </MediaShell>
    );
  }

  if (urlQuery.error || !urlQuery.data) {
    return (
      <MediaShell tone="error">
        <AlertTriangle className="size-6" />
        <span className="font-mono text-[10px]">
          {urlQuery.error?.message ?? "Couldn't load preview"}
        </span>
      </MediaShell>
    );
  }

  const url = urlQuery.data.url;

  switch (kind) {
    case "image":
      return <ImagePreview url={url} />;
    case "video":
      return <VideoPreview url={url} />;
    case "audio":
      return <AudioPreview url={url} />;
    case "pdf":
      return <PdfPreview url={url} />;
    case "text":
      return <TextPreview url={url} name={name} size={size} />;
  }
}

function MediaShell({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card/40 flex h-64 items-center justify-center border-b",
        className
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-2",
          tone === "error" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ImagePreview({ url }: { url: string }) {
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => setErrored(false), [url]);

  if (errored) {
    return (
      <MediaShell tone="error">
        <AlertTriangle className="size-6" />
        <span className="font-mono text-[10px]">Image failed to load</span>
      </MediaShell>
    );
  }

  return (
    <div className="border-border bg-input-bg/60 flex max-h-[60vh] min-h-64 items-center justify-center overflow-hidden border-b p-3">
      <img
        src={url}
        alt=""
        onError={() => setErrored(true)}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="border-border border-b bg-black">
      <video
        key={url}
        src={url}
        controls
        preload="metadata"
        className="block max-h-[60vh] w-full"
      />
    </div>
  );
}

function AudioPreview({ url }: { url: string }) {
  return (
    <div className="border-border bg-card/40 flex h-32 items-center justify-center border-b px-4">
      <audio key={url} src={url} controls preload="metadata" className="w-full" />
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  return (
    <div className="border-border bg-input-bg border-b">
      <iframe
        key={url}
        src={url}
        title="PDF preview"
        className="block h-[70vh] w-full border-0"
      />
    </div>
  );
}

/**
 * Text/code body. Two stages:
 *   1. Fetch the presigned URL, capped at TEXT_PREVIEW_BYTES via Range so we
 *      don't OOM on a multi-GB log file.
 *   2. If the extension maps to a known Shiki language, tokenize + theme it
 *      in a worker (see highlighter.ts) and swap in. Otherwise render as
 *      plain text in the same shell so the visual stays consistent.
 *
 * Rendering is virtualized — only the ~30 lines visible in the viewport are
 * mounted at a time. This is what keeps a 3MB JSON readable instead of
 * dumping tens of thousands of token spans into the DOM at once.
 */
function TextPreview({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size: number | undefined;
}) {
  type FetchState =
    | { kind: "loading" }
    | { kind: "ok"; text: string; truncated: boolean }
    | { kind: "error"; message: string };

  const [state, setState] = React.useState<FetchState>({ kind: "loading" });
  const [tokens, setTokens] = React.useState<ThemedToken[][] | null>(null);
  const [highlighting, setHighlighting] = React.useState(false);

  const lang = React.useMemo(() => shikiLangFor(name), [name]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setTokens(null);

    const willTruncate =
      typeof size === "number" && size > TEXT_PREVIEW_BYTES;

    (async () => {
      try {
        const res = await fetch(url, {
          headers: willTruncate
            ? { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` }
            : {},
        });
        if (!res.ok && res.status !== 206) {
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        if (cancelled) return;
        setState({ kind: "ok", text, truncated: willTruncate });
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Fetch failed",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  React.useEffect(() => {
    if (state.kind !== "ok" || !lang) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    setHighlighting(true);
    highlightToTokens(state.text, lang)
      .then((toks) => {
        if (cancelled) return;
        // startTransition lets React interrupt the rerender if the user clicks
        // prev/next before the (visible-only) rows finish re-mounting with
        // their styled spans.
        React.startTransition(() => setTokens(toks));
      })
      .catch(() => {
        // Highlighting failure falls back to plain text.
        if (cancelled) return;
        setTokens(null);
      })
      .finally(() => {
        if (cancelled) return;
        setHighlighting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state, lang]);

  if (state.kind === "loading") {
    return (
      <MediaShell>
        <Loader2 className="size-6 animate-spin" />
        <span className="font-mono text-[10px]">Loading text...</span>
      </MediaShell>
    );
  }

  if (state.kind === "error") {
    return (
      <MediaShell tone="error">
        <AlertTriangle className="size-6" />
        <span className="font-mono text-[10px]">{state.message}</span>
      </MediaShell>
    );
  }

  return (
    <div className="border-border bg-input-bg border-b">
      <VirtualText text={state.text} tokens={tokens} />
      {highlighting && lang && (
        <div className="border-border text-muted-foreground bg-card/60 flex items-center gap-1.5 border-t px-3 py-1.5 font-mono text-[10px]">
          <Loader2 className="size-3 animate-spin" />
          Highlighting...
        </div>
      )}
      {state.truncated && (
        <div className="border-border text-accent-yellow bg-card/60 border-t px-3 py-1.5 font-mono text-[10px]">
          Truncated to first {formatBytes(TEXT_PREVIEW_BYTES)} - download the
          file for the full contents.
        </div>
      )}
    </div>
  );
}

/** Matches `font-mono text-[11px] leading-5` (1.25rem = 20px at 16px root). */
const LINE_HEIGHT_PX = 20;

/**
 * Hard cap on what any single line is allowed to render visually. Beyond this
 * we slice and add a "... N more chars" marker — same approach Monaco's
 * `editor.stopRenderingLineAfter` takes. Keeps a 512KB single-line minified
 * JSON from spawning one giant span the browser has to lay out.
 */
const MAX_LINE_CHARS = 5_000;

/**
 * Virtualized line viewer. Accepts either Shiki tokens (lines × tokens) or
 * falls back to splitting plain text by newline. Whichever it has, only the
 * lines currently in the viewport are mounted in the DOM. The scroll
 * container scrolls both axes; the line-number gutter is sticky so it stays
 * visible while panning horizontally on long lines.
 */
function VirtualText({
  text,
  tokens,
}: {
  text: string;
  tokens: ThemedToken[][] | null;
}) {
  const plainLines = React.useMemo<string[] | null>(() => {
    if (tokens) return null;
    const arr = text.split("\n");
    if (arr.length > 0 && arr[arr.length - 1] === "") arr.pop();
    return arr;
  }, [text, tokens]);

  const lineCount = tokens ? tokens.length : (plainLines?.length ?? 0);
  const gutterChars = String(Math.max(1, lineCount)).length;

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lineCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  // Padded-virtualization layout: the spacer divs above and below the rendered
  // window push the rendered slice into its true scroll position. Cheaper to
  // reason about than absolute positioning when each row also needs to
  // contribute to horizontal scroll width and host a sticky gutter.
  const topPad = items[0]?.start ?? 0;
  const bottomPad = totalSize - (items[items.length - 1]?.end ?? 0);

  return (
    <div ref={parentRef} className="max-h-[60vh] overflow-auto">
      <div
        className="font-mono text-[11px] leading-5"
        style={{ paddingTop: topPad, paddingBottom: bottomPad }}
      >
        {items.map((vr) => (
          <LineRow
            key={vr.index}
            index={vr.index}
            height={vr.size}
            gutterChars={gutterChars}
            tokens={tokens ? tokens[vr.index] : undefined}
            text={plainLines ? plainLines[vr.index] : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function LineRow({
  index,
  height,
  gutterChars,
  tokens,
  text,
}: {
  index: number;
  height: number;
  gutterChars: number;
  tokens?: ThemedToken[];
  text?: string;
}) {
  return (
    <div className="flex" style={{ height }}>
      <span
        aria-hidden
        className="text-muted-foreground bg-card/60 border-border sticky left-0 z-10 shrink-0 border-r px-2 text-right select-none"
        style={{ width: `${gutterChars + 1}ch` }}
      >
        {index + 1}
      </span>
      <span className="whitespace-pre px-3">
        {tokens
          ? renderTokenLine(tokens)
          : renderPlainLine(text ?? "")}
      </span>
    </div>
  );
}

function renderTokenLine(tokens: ThemedToken[]): React.ReactNode {
  let total = 0;
  for (const t of tokens) total += t.content.length;

  if (total === 0) return " ";
  if (total <= MAX_LINE_CHARS) {
    return tokens.map((t, i) => (
      <span key={i} style={tokenStyle(t)}>
        {t.content}
      </span>
    ));
  }

  // Slice token-by-token until we hit the per-line cap, then append a marker.
  let remaining = MAX_LINE_CHARS;
  const spans: React.ReactNode[] = [];
  for (let i = 0; i < tokens.length && remaining > 0; i++) {
    const t = tokens[i]!;
    const slice =
      t.content.length > remaining ? t.content.slice(0, remaining) : t.content;
    spans.push(
      <span key={i} style={tokenStyle(t)}>
        {slice}
      </span>
    );
    remaining -= slice.length;
  }
  spans.push(<TruncatedMarker key="trunc" extra={total - MAX_LINE_CHARS} />);
  return spans;
}

function renderPlainLine(line: string): React.ReactNode {
  if (line.length === 0) return " ";
  if (line.length <= MAX_LINE_CHARS) return line;
  return (
    <>
      {line.slice(0, MAX_LINE_CHARS)}
      <TruncatedMarker extra={line.length - MAX_LINE_CHARS} />
    </>
  );
}

function TruncatedMarker({ extra }: { extra: number }) {
  return (
    <span className="text-muted-foreground italic">
      {` … (${extra.toLocaleString()} more chars)`}
    </span>
  );
}

/**
 * Shiki's FontStyle is a bitfield: Italic=1, Bold=2, Underline=4,
 * Strikethrough=8. NotSet is -1 (all bits set), so we gate on `> 0` to avoid
 * treating "not set" as "everything set".
 */
function tokenStyle(t: ThemedToken): React.CSSProperties {
  const fs = t.fontStyle ?? 0;
  const styled = fs > 0;
  return {
    color: t.color,
    backgroundColor: t.bgColor,
    fontStyle: styled && (fs & 1) !== 0 ? "italic" : undefined,
    fontWeight: styled && (fs & 2) !== 0 ? "bold" : undefined,
    textDecoration: styled && (fs & 4) !== 0 ? "underline" : undefined,
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-20 shrink-0 text-[10px] tracking-wider uppercase">
        {label}
      </dt>
      <dd className="text-foreground min-w-0 flex-1 break-all">{value}</dd>
    </div>
  );
}

function IconBtn({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

function ActionBtn({
  icon,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 font-mono text-[11px] transition-colors",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
