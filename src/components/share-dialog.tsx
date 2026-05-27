import * as React from "react";
import { toast } from "sonner";
import { toCanvas as renderQrToCanvas } from "qrcode";

import { CheckIcon, Link as LinkIcon } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchDownloadUrl } from "@/lib/api/objects";
import { useCopied } from "@/lib/use-copied";
import { basename } from "@/lib/object-path";

/** S3 SDK ceiling for `getSignedUrl(..., { expiresIn })`. */
const MAX_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECONDS = 60;

const PRESETS = [
  { label: "15m", seconds: 15 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "1d", seconds: 24 * 60 * 60 },
  { label: "7d", seconds: 7 * 24 * 60 * 60 },
] as const;

interface LinkState {
  url: string | null;
  expiresAt: string | null;
  pending: boolean;
  error: string | null;
}

type LinkAction =
  | { type: "start" }
  | { type: "success"; url: string; expiresAt: string }
  | { type: "fail"; message: string };

const initialLinkState: LinkState = {
  url: null,
  expiresAt: null,
  pending: false,
  error: null,
};

function linkReducer(state: LinkState, action: LinkAction): LinkState {
  switch (action.type) {
    case "start":
      return { ...state, pending: true, error: null };
    case "success":
      return {
        url: action.url,
        expiresAt: action.expiresAt,
        pending: false,
        error: null,
      };
    case "fail":
      return {
        url: null,
        expiresAt: null,
        pending: false,
        error: action.message,
      };
  }
}

/**
 * Mint-a-presigned-link dialog. Holds its own URL state and re-fetches each
 * time the TTL chip changes; parent only owns which file is being shared via
 * `objectKey`. The body mounts on open so state resets naturally on close.
 */
export function ShareDialog({
  open,
  onOpenChange,
  connectionId,
  bucket,
  objectKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  bucket: string;
  /** The file to mint a link for. May briefly stay non-null while the dialog
   *  closes — we don't reset to null on the parent so the description doesn't
   *  blank-out mid-animation. */
  objectKey: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && objectKey && (
          <ShareDialogBody
            connectionId={connectionId}
            bucket={bucket}
            objectKey={objectKey}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({
  connectionId,
  bucket,
  objectKey,
  onClose,
}: {
  connectionId: string;
  bucket: string;
  objectKey: string;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = React.useState<number>(PRESETS[0].seconds);
  const [customStr, setCustomStr] = React.useState<string>("");
  const [link, dispatch] = React.useReducer(linkReducer, initialLinkState);

  React.useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    fetchDownloadUrl(connectionId, bucket, objectKey, seconds)
      .then((res) => {
        if (cancelled) return;
        dispatch({ type: "success", url: res.url, expiresAt: res.expiresAt });
      })
      .catch((e) => {
        if (cancelled) return;
        dispatch({
          type: "fail",
          message: e instanceof Error ? e.message : "Couldn't mint link",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [objectKey, connectionId, bucket, seconds]);

  const [copied, flashCopied] = useCopied();
  const handleCopy = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      flashCopied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy");
    }
  };

  const handleCustomApply = () => {
    const n = Math.floor(Number(customStr));
    if (!Number.isFinite(n) || n < MIN_SECONDS || n > MAX_SECONDS) {
      toast.error("Pick between 60s and 7 days");
      return;
    }
    setSeconds(n);
  };

  const isCustom =
    customStr !== "" && !PRESETS.some((p) => p.seconds === seconds);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Share link</DialogTitle>
        <DialogDescription className="font-mono text-xs">
          <code className="break-all">{basename(objectKey)}</code>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div>
          <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wider uppercase">
            Expires in
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => {
              const active = !isCustom && seconds === p.seconds;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setSeconds(p.seconds);
                    setCustomStr("");
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors",
                    active
                      ? "border-primary-text/40 bg-primary-text/15 text-primary-text"
                      : "border-border bg-input-bg text-foreground hover:bg-surface-1"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                value={customStr}
                onChange={(e) => setCustomStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomApply();
                  }
                }}
                placeholder="Custom (s)"
                aria-label="Custom expiry in seconds"
                className="h-9 w-28 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCustomApply}
                disabled={!customStr}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wider uppercase">
            URL
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link.pending ? "Generating…" : (link.error ?? link.url ?? "")}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Generated share URL"
              className={cn(
                "h-9 flex-1 font-mono text-[11px]",
                link.error && "text-destructive"
              )}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopy}
              disabled={!link.url || link.pending}
              className={copied ? "text-success" : undefined}
            >
              {copied ? (
                <>
                  <CheckIcon /> Copied
                </>
              ) : (
                <>
                  <LinkIcon /> Copy
                </>
              )}
            </Button>
          </div>
          <Countdown expiresAt={link.expiresAt} />
        </div>

        <QrPanel value={link.url} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!expiresAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const remaining = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - now) / 1000)
  );
  return (
    <div className="text-muted-foreground mt-2 font-mono text-[10px]">
      {remaining > 0 ? `Expires in ${formatRemaining(remaining)}` : "Expired"}
    </div>
  );
}

function formatRemaining(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function QrPanel({ value }: { value: string | null }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!value) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    renderQrToCanvas(canvas, value, { width: 192, margin: 1 }).catch((err) => {
      console.error("[share-dialog] qr render failed", err);
    });
  }, [value]);

  return (
    <div className="flex flex-col items-center">
      <div className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wider uppercase">
        QR
      </div>
      <div className="rounded bg-white p-2">
        <canvas
          ref={canvasRef}
          width={192}
          height={192}
          className="block"
          aria-label="QR code for share link"
        />
      </div>
    </div>
  );
}
