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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { validateBucketName, warnBucketName } from "@/lib/bucket-name";
import {
  useBucketVersioning,
  useSetBucketVersioning,
} from "@/lib/api/versioning";

/**
 * Create-bucket prompt. Mirrors the chrome of NewFolderDialog (autofocus,
 * Enter submits, monospaced descriptor) but with bucket-name validation shown
 * inline. Errors block submission; warnings (e.g. dots in the name) are
 * advisory and rendered alongside the submit button.
 *
 * Server-side errors (BucketAlreadyExists, AccessDenied, …) are surfaced by
 * the caller via the mutation's `onError` toast — we don't second-guess them
 * here because the upstream message is more informative than anything we'd
 * synthesize.
 */
export function CreateBucketDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <CreateBucketForm
            pending={pending}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateBucketForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("");
  const trimmed = name.trim();
  // Skip validation while the field is empty so the user doesn't see a red
  // error before they've typed anything.
  const error = trimmed ? validateBucketName(trimmed) : null;
  const warning = trimmed && !error ? warnBucketName(trimmed) : null;
  const canSubmit = !!trimmed && !error && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>New bucket</DialogTitle>
        <DialogDescription className="font-mono text-xs">
          3–63 chars · lowercase letters, digits, hyphens · must start and end
          with a letter or digit.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(trimmed);
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="my-bucket"
            aria-label="Bucket name"
            aria-invalid={!!error}
            aria-describedby={error ? "bucket-name-error" : undefined}
          />
          {error && (
            <p
              id="bucket-name-error"
              className="text-accent-red font-mono text-[11px]"
            >
              {error}
            </p>
          )}
          {warning && (
            <p className="text-accent-yellow font-mono text-[11px]">
              {warning}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Per-bucket settings. Today this is just the Versioning toggle — additional
 * subresource controls (lifecycle, CORS, object lock, …) will land here as
 * later phases ship. Each subresource is gracefully degraded on its own: if
 * the backend doesn't implement `GetBucketVersioning`, the row collapses to a
 * muted "unsupported" message instead of breaking the dialog.
 *
 * S3 has no "Disabled" target for versioning — once enabled the only off
 * switch is "Suspended" (existing versions stay, new writes don't create
 * new versions). The toggle UI explains that inline so the asymmetry doesn't
 * surprise the user.
 */
export function BucketSettingsDialog({
  open,
  onOpenChange,
  connectionId,
  bucket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  bucket: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {bucket ? `Bucket settings — ${bucket}` : "Bucket settings"}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Per-bucket subresources. Toggles take effect immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {open && connectionId && bucket && (
            <VersioningToggle connectionId={connectionId} bucket={bucket} />
          )}
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

function VersioningToggle({
  connectionId,
  bucket,
}: {
  connectionId: string;
  bucket: string;
}) {
  const state = useBucketVersioning(connectionId, bucket);
  const setStatus = useSetBucketVersioning(connectionId, bucket, {
    onSuccess: (_data, vars) => {
      toast.success(
        vars.status === "Enabled"
          ? "Versioning enabled"
          : "Versioning suspended"
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const status = state.data?.status ?? "Disabled";
  const checked = status === "Enabled";
  // S3's "off" is Suspended once it's ever been Enabled. From a UI standpoint
  // the user just sees a toggle — the difference between never-enabled and
  // suspended-after-enable is annotated below the switch.
  const disabled = state.isPending || setStatus.isPending || !!state.error;

  return (
    <div className="border-border bg-input-bg/30 space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label className="ml-0 text-sm">Object versioning</Label>
          <p className="text-muted-foreground font-mono text-[11px]">
            Keep every write as a separate version. Older versions stay until
            you explicitly delete them.
          </p>
        </div>
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) =>
            setStatus.mutate({ status: next ? "Enabled" : "Suspended" })
          }
        />
      </div>

      {state.error && (
        <div className="text-muted-foreground space-y-1 font-mono text-[10px]">
          <div>Versioning isn't supported on this backend.</div>
          <div className="text-foreground/50 break-all">
            {state.error.message}
          </div>
        </div>
      )}

      {!state.error && status === "Suspended" && (
        <div className="text-muted-foreground font-mono text-[10px]">
          Suspended: existing versions remain, but new writes won't create
          new versions until you re-enable.
        </div>
      )}

      {!state.error && status === "Disabled" && (
        <div className="text-muted-foreground font-mono text-[10px]">
          Versioning has never been enabled on this bucket.
        </div>
      )}
    </div>
  );
}
