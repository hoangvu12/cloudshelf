import * as React from "react";

import { Kbd, KeyCombo } from "@/lib/kbd";

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
