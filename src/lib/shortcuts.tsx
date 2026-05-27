import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isEditableTarget } from "@/lib/editable-target";
import { Kbd } from "@/lib/kbd";
import { SHORTCUTS } from "@/lib/shortcuts-data";

/**
 * Help modal rendered by the global `?` shortcut. Mirrors the layout of
 * the settings page's keyboard section so the two are visually consistent.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Press <Kbd>?</Kbd> any time to open this list.
          </DialogDescription>
        </DialogHeader>
        <div className="border-border bg-card/50 max-h-[60vh] overflow-auto rounded-lg border">
          <div className="bg-muted/30 border-border text-muted-foreground sticky top-0 grid grid-cols-2 border-b p-3 font-mono text-xs font-bold tracking-wider uppercase">
            <div>Shortcut</div>
            <div>Action</div>
          </div>
          <div className="divide-border/50 divide-y text-sm">
            {SHORTCUTS.map((s) => (
              <div
                key={s.action}
                className="hover:bg-muted/20 grid grid-cols-2 items-center p-3"
              >
                <div className="flex items-center gap-1">{s.keys}</div>
                <div className="text-muted-foreground">{s.action}</div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Global "?" listener. Hooks into the root layout so any page can open the
 * help dialog. Skips when the user is typing into an input/textarea so we
 * don't hijack a literal "?" character.
 */
export function useShortcutsHelp(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}
