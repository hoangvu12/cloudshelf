import * as React from "react";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Database, FolderPlus, Search, Settings } from "@/lib/icons";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import type { Bucket } from "@server/types";

/**
 * Rofi-inspired ⌘K palette. Lists buckets + global actions, filterable.
 * Trigger from anywhere via `useCommandPaletteShortcut()`.
 */
export function CommandPalette({
  open,
  onOpenChange,
  buckets,
  onSelectBucket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buckets: Bucket[];
  onSelectBucket?: (name: string) => void;
}) {
  const navigate = useNavigate();
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-32 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2",
            "bg-background border-primary-text overflow-hidden rounded-xl border-2",
            "shadow-[0_0_40px_color-mix(in_oklab,_var(--primary-text)_15%,_transparent)] outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <Command className="bg-transparent">
            <div className="bg-background border-border flex items-center gap-3 border-b p-4">
              <Search className="text-primary-text size-5 shrink-0" />
              <Command.Input
                autoFocus
                placeholder="Search buckets, actions, or settings..."
                className="placeholder:text-surface-1 text-foreground w-full border-none bg-transparent font-mono text-lg outline-none"
              />
              <kbd className="bg-muted text-muted-foreground border-surface-1 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                ESC
              </kbd>
            </div>
            <Command.List className="bg-card max-h-[400px] overflow-y-auto p-2 font-mono text-sm">
              <Command.Empty className="text-muted-foreground px-3 py-6 text-center text-xs">
                No matches.
              </Command.Empty>

              {buckets.length > 0 && (
                <Command.Group
                  heading="Buckets"
                  className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
                >
                  {buckets.map((b) => (
                    <PaletteItem
                      key={b.name}
                      value={`bucket ${b.name}`}
                      onSelect={() => {
                        onSelectBucket?.(b.name);
                        close();
                      }}
                      icon={<Database className="text-yellow-300 size-4" />}
                      trailing={
                        <span className="text-muted-foreground text-[10px]">
                          {formatBytes(b.sizeBytes)}
                        </span>
                      }
                    >
                      {b.name}
                    </PaletteItem>
                  ))}
                </Command.Group>
              )}

              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
              >
                <PaletteItem
                  value="action create new bucket"
                  onSelect={close}
                  icon={<FolderPlus className="text-primary-text size-4" />}
                >
                  Create new bucket
                </PaletteItem>
                <PaletteItem
                  value="action open configuration settings"
                  onSelect={() => {
                    navigate({ to: "/setup" });
                    close();
                  }}
                  icon={<Settings className="text-muted-foreground size-4" />}
                >
                  Open configuration
                </PaletteItem>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteItem({
  value,
  onSelect,
  icon,
  trailing,
  children,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "text-muted-foreground flex cursor-pointer items-center gap-3 rounded px-3 py-2",
        "data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground"
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {trailing}
    </Command.Item>
  );
}

/**
 * Wires ⌘K / Ctrl+K to toggle the palette. Returns the `[open, setOpen]`
 * tuple so the caller can also control it programmatically.
 */
export function useCommandPaletteShortcut(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}
