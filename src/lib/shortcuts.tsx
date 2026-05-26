import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Single source of truth for the keyboard-shortcut catalogue. The settings
 * page and the `?` help dialog both render from this list, so adding a new
 * shortcut here keeps both surfaces in sync.
 *
 * The strings are intentionally Mac-flavored (⌘/⇧). On Windows/Linux the
 * runtime listeners accept Ctrl as an alias for ⌘; we don't bother
 * platform-switching the display because most users recognize both.
 */
export const SHORTCUTS: { keys: React.ReactNode; action: string }[] = [
  { keys: <KeyCombo keys={["⌘", "K"]} />, action: "Global search" },
  { keys: <KeyCombo keys={["⌘", "U"]} />, action: "Upload files" },
  { keys: <KeyCombo keys={["⌘", "⇧", "N"]} />, action: "New bucket / New folder" },
  {
    keys: (
      <>
        <Kbd>⌫</Kbd> or <Kbd>Del</Kbd>
      </>
    ),
    action: "Delete selected items",
  },
  { keys: <KeyCombo keys={["⌘", "A"]} />, action: "Select all in view" },
  {
    keys: (
      <>
        <Kbd>J</Kbd> / <Kbd>K</Kbd> or <Kbd>↓</Kbd> / <Kbd>↑</Kbd>
      </>
    ),
    action: "Navigate list up/down",
  },
  { keys: <Kbd>Space</Kbd>, action: "Toggle preview sidebar" },
  { keys: <Kbd>/</Kbd>, action: "Focus filter" },
  { keys: <Kbd>F2</Kbd>, action: "Rename selected item" },
  { keys: <KeyCombo keys={["⌘", "C"]} />, action: "Copy public link" },
  { keys: <Kbd>?</Kbd>, action: "Show all shortcuts" },
  { keys: <Kbd>Esc</Kbd>, action: "Close modals / Clear selection" },
];

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-ctp-mantle border-ctp-surface1 text-ctp-text inline-block rounded border border-b-2 px-1.5 py-0.5 font-mono text-[11px] shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-ctp-subtext mx-1 text-xs">+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </>
  );
}

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
        <div className="border-ctp-surface0 bg-ctp-mantle/50 max-h-[60vh] overflow-auto rounded-lg border">
          <div className="bg-ctp-surface0/30 border-ctp-surface0 text-ctp-subtext sticky top-0 grid grid-cols-2 border-b p-3 font-mono text-xs font-bold tracking-wider uppercase">
            <div>Shortcut</div>
            <div>Action</div>
          </div>
          <div className="divide-ctp-surface0/50 divide-y text-sm">
            {SHORTCUTS.map((s, i) => (
              <div
                key={i}
                className="hover:bg-ctp-surface0/20 grid grid-cols-2 items-center p-3"
              >
                <div className="flex items-center gap-1">{s.keys}</div>
                <div className="text-ctp-subtext">{s.action}</div>
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

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
