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

/**
 * Lightweight prompt dialogs for create-folder, rename, move, and bulk-delete
 * confirmation. All four are intentionally minimal — full keyboard support,
 * autofocus on the input, Enter submits.
 */

export function NewFolderDialog({
  open,
  onOpenChange,
  onSubmit,
  basePrefix,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  /** Where the folder will be created. Shown for context. */
  basePrefix: string;
  pending: boolean;
}) {
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Will be created at <code>{basePrefix || "/"}</code>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) onSubmit(trimmed);
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="folder-name"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  open,
  onOpenChange,
  initialName,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onSubmit: (newName: string) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState(initialName);
  React.useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const changed = name.trim() && name.trim() !== initialName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            <code>{initialName}</code>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (changed) onSubmit(name.trim());
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => {
              // Select just the basename (before the last "."), like Finder does.
              const dot = name.lastIndexOf(".");
              if (dot > 0) e.currentTarget.setSelectionRange(0, dot);
              else e.currentTarget.select();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !changed}>
              {pending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MovePromptDialog({
  open,
  onOpenChange,
  defaultPrefix,
  count,
  onSubmit,
  pending,
  mode = "move",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPrefix: string;
  count: number;
  onSubmit: (destPrefix: string) => void;
  pending: boolean;
  /** Same UI, different label and verb. */
  mode?: "move" | "copy";
}) {
  const [dest, setDest] = React.useState(defaultPrefix);
  React.useEffect(() => {
    if (open) setDest(defaultPrefix);
  }, [open, defaultPrefix]);

  const title = mode === "move" ? "Move" : "Copy to";
  const verb = mode === "move" ? "Move" : "Copy";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title} {count} item{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Enter a destination prefix. Use <code>/</code> as the separator;
            leave empty for the bucket root.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(dest);
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="photos/2025/"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? `${verb.replace(/e$/, "")}ing...` : verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {count} item{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="font-sans">
            This permanently removes the selected files from S3. Folders are
            removed as markers only — any objects already inside a folder won't
            be deleted by this action.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
