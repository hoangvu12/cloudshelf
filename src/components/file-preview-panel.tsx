import * as React from "react";
import { toast } from "sonner";
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
import { highlightToHtml, shikiLangFor } from "@/lib/highlighter";
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
 *      via the lazy-loaded highlighter (Catppuccin Mocha). Otherwise render
 *      as plain text in the same shell so the visual stays consistent.
 *
 * Shiki returns themed `<pre><code>` HTML; we render it via
 * dangerouslySetInnerHTML and add a CSS-counter gutter for line numbers. The
 * highlighter escapes input, so untrusted file contents can't inject.
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
  const [html, setHtml] = React.useState<string | null>(null);
  const [highlighting, setHighlighting] = React.useState(false);

  const lang = React.useMemo(() => shikiLangFor(name), [name]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setHtml(null);

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
      setHtml(null);
      return;
    }
    let cancelled = false;
    setHighlighting(true);
    highlightToHtml(state.text, lang)
      .then((out) => {
        if (cancelled) return;
        setHtml(out);
      })
      .catch(() => {
        // Highlighting failure falls back to plain text by leaving html null.
        if (cancelled) return;
        setHtml(null);
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
      <div className="max-h-[60vh] overflow-auto">
        {lang && html ? (
          <div
            className={cn(
              "shiki-preview font-mono text-[11px] leading-5",
              // Pull Shiki's output into our chrome: transparent bg, our
              // padding, and a counter-driven gutter on each .line span.
              "[&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:py-2 [&_pre]:pr-3",
              "[&_code]:block [&_code]:[counter-reset:line]",
              "[&_.line]:relative [&_.line]:pl-12",
              "[&_.line]:before:absolute [&_.line]:before:left-0 [&_.line]:before:w-9 [&_.line]:before:pr-2 [&_.line]:before:text-right [&_.line]:before:text-muted-foreground [&_.line]:before:select-none",
              "[&_.line]:before:[content:counter(line)] [&_.line]:before:[counter-increment:line]"
            )}
            // Shiki escapes input itself, safe to inject.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <PlainText text={state.text} />
        )}
      </div>
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

/**
 * Plain-text fallback for unrecognized languages and for the brief window
 * while Shiki is still loading. Keeps the same shape as the highlighted
 * branch so the panel doesn't visually jump when highlighting finishes.
 */
function PlainText({ text }: { text: string }) {
  const lines = React.useMemo(() => {
    const arr = text.split("\n");
    if (arr.length > 0 && arr[arr.length - 1] === "") arr.pop();
    return arr;
  }, [text]);
  const gutterWidth = String(lines.length || 1).length;

  return (
    <pre className="text-foreground flex font-mono text-[11px] leading-5">
      <code
        aria-hidden
        className="text-muted-foreground border-border bg-card/60 sticky left-0 shrink-0 border-r px-2 py-2 text-right select-none"
      >
        {lines.map((_, i) => (
          <div key={i}>{String(i + 1).padStart(gutterWidth, " ")}</div>
        ))}
      </code>
      <code className="min-w-0 flex-1 px-3 py-2">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line || " "}
          </div>
        ))}
      </code>
    </pre>
  );
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
