import * as React from "react";
import { toast } from "sonner";

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
import { Link as LinkIcon } from "@/lib/icons";
import { normalizePrefix } from "@/lib/object-path";
import { useUploadFromUrl } from "@/lib/api/upload-from-url";

/**
 * Prompt for a public URL + destination filename, then fire the server-side
 * "from URL" route. Bytes never touch the browser — the server streams the
 * upstream response straight into S3 via @aws-sdk/lib-storage. Progress is
 * communicated via a sonner toast (loading → success/failure) rather than a
 * live byte counter because the route is a single HTTP request that returns
 * only when the multipart upload is fully done.
 *
 * Filename defaults to the URL's last path segment (decoded, query stripped).
 * The user can override; we always join it with the active prefix to build
 * the final S3 key. No subdirectories at this entry point — a single file at
 * a time, dropped into the current folder.
 */
export function UploadFromUrlDialog({
  open,
  onOpenChange,
  connectionId,
  bucket,
  prefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  bucket: string;
  prefix: string;
}) {
  const [url, setUrl] = React.useState("");
  const [filename, setFilename] = React.useState("");
  // Tracks whether the user has manually typed in the filename field. While
  // false the field tracks the URL's last path segment automatically; once
  // edited we leave it alone so the user's choice survives further URL tweaks.
  const [filenameDirty, setFilenameDirty] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setUrl("");
    setFilename("");
    setFilenameDirty(false);
  }, [open]);

  // Auto-populate the filename from the URL's basename until the user edits
  // the field. The toLocaleString-style URL parse handles "?query" + "#hash"
  // correctly; we strip both and percent-decode the last path segment.
  React.useEffect(() => {
    if (filenameDirty) return;
    setFilename(deriveFilenameFromUrl(url));
  }, [url, filenameDirty]);

  const upload = useUploadFromUrl(connectionId, bucket);

  const trimmedFilename = filename.trim();
  const trimmedUrl = url.trim();
  // The submit button is enabled once both fields look plausible; the server
  // validates the URL scheme + hostname properly. Local checks here are just
  // about not firing an obviously-broken request.
  const canSubmit =
    !upload.isPending &&
    trimmedFilename.length > 0 &&
    /^https?:\/\//i.test(trimmedUrl);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const key = normalizePrefix(prefix) + trimmedFilename;
    const toastId = toast.loading(`Fetching ${trimmedFilename}…`, {
      description: trimmedUrl,
    });
    upload.mutate(
      { url: trimmedUrl, key },
      {
        onSuccess: () => {
          toast.success("Uploaded from URL", {
            id: toastId,
            description: key,
          });
          onOpenChange(false);
        },
        onError: (e) => {
          toast.error(e.message ?? "Upload from URL failed", {
            id: toastId,
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload from URL</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Server streams the URL into <code>{prefix || "/"}</code>.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-muted-foreground mb-2 block font-mono text-[10px] tracking-wider uppercase">
              URL
            </label>
            <div className="relative">
              <LinkIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                autoFocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="h-9 pl-8 font-mono text-[11px]"
              />
            </div>
          </div>

          <div>
            <label className="text-muted-foreground mb-2 block font-mono text-[10px] tracking-wider uppercase">
              Filename
            </label>
            <Input
              type="text"
              value={filename}
              onChange={(e) => {
                setFilename(e.target.value);
                setFilenameDirty(true);
              }}
              placeholder="image.png"
              className="h-9 font-mono text-[11px]"
            />
            <p className="text-muted-foreground mt-1.5 font-mono text-[10px] break-all">
              Lands at <code>{prefix || ""}{trimmedFilename || "…"}</code>
            </p>
          </div>

          <p className="text-muted-foreground font-mono text-[10px] leading-relaxed">
            Only http(s) URLs. Internal hosts (localhost, 127.0.0.1, RFC1918)
            are refused. Hard cap: 1 GB per upload.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={upload.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Last path segment of the URL, percent-decoded, query + hash stripped. Falls
 * back to "" so the field stays editable while the user is mid-typing.
 */
function deriveFilenameFromUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!last) return "";
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return "";
  }
}
