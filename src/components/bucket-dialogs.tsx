import * as React from "react";

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
import { validateBucketName, warnBucketName } from "@/lib/bucket-name";

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
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (open) setName("");
  }, [open]);

  const trimmed = name.trim();
  // Skip validation while the field is empty so the user doesn't see a red
  // error before they've typed anything.
  const error = trimmed ? validateBucketName(trimmed) : null;
  const warning = trimmed && !error ? warnBucketName(trimmed) : null;
  const canSubmit = !!trimmed && !error && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
