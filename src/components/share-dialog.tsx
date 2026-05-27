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

/**
 * Mint-a-presigned-link dialog. Holds its own URL state and re-fetches each
 * time the open transition flips or the TTL chip changes; parent only owns
 * which file is being shared via `objectKey`.
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
  const [seconds, setSeconds] = React.useState<number>(PRESETS[0].seconds);
  const [customStr, setCustomStr] = React.useState<string>("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSeconds(PRESETS[0].seconds);
    setCustomStr("");
    setUrl(null);
    setExpiresAt(null);
    setError(null);
  }, [open, objectKey]);

  React.useEffect(() => {
    if (!open || !objectKey) return;
    let cancelled = false;
    setPending(true);
    setError(null);
    fetchDownloadUrl(connectionId, bucket, objectKey, seconds)
      .then((res) => {
        if (cancelled) return;
        setUrl(res.url);
        setExpiresAt(res.expiresAt);
      })
      .catch((e) => {
        if (cancelled) return;
        setUrl(null);
        setExpiresAt(null);
        setError(e instanceof Error ? e.message : "Couldn't mint link");
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, objectKey, connectionId, bucket, seconds]);

  const [copied, flashCopied] = useCopied();
  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {objectKey ? (
              <code className="break-all">{basename(objectKey)}</code>
            ) : null}
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
                value={pending ? "Generating…" : (error ?? url ?? "")}
                onFocus={(e) => e.currentTarget.select()}
                className={cn(
                  "h-9 flex-1 font-mono text-[11px]",
                  error && "text-destructive"
                )}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopy}
                disabled={!url || pending}
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
            <Countdown expiresAt={expiresAt} />
          </div>

          <QrPanel value={url} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
