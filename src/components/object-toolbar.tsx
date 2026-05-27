import * as React from "react";
import {
  CheckIcon,
  CheckSquare,
  Download,
  Eye,
  FolderOutput,
  FolderPlus,
  Link as LinkIcon,
  PenLine,
  Search,
  Share,
  Trash2,
  UploadCloud,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes, formatCount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useCopied } from "@/lib/use-copied";
import { usePrefsStore } from "@/stores/prefs";

/**
 * Two-mode toolbar that morphs based on selection state:
 *   - 0 selected → Upload + New folder on the left, "N items · Total" on the right
 *   - ≥1 selected → mauve "N selected" pill + Clear, bulk actions on the right
 *
 * Inputs stay flat so callers can wire individual mutations without forcing a
 * shape change inside the toolbar.
 */
export function ObjectToolbar({
  selectedCount,
  totalCount,
  totalBytes,
  filter,
  onFilterChange,
  filterInputRef,
  onUpload,
  onNewFolder,
  onClearSelection,
  onPreview,
  canPreview,
  onDownloadSelected,
  onCopyLink,
  onShare,
  onMove,
  onRename,
  onDelete,
  className,
}: {
  selectedCount: number;
  totalCount: number;
  totalBytes: number;
  filter: string;
  onFilterChange: (next: string) => void;
  /** Exposed so the `/` shortcut can focus this input from the page level. */
  filterInputRef?: React.Ref<HTMLInputElement>;
  onUpload: () => void;
  onNewFolder: () => void;
  onClearSelection: () => void;
  onPreview: () => void;
  /** True when exactly one file (not folder) is selected. */
  canPreview: boolean;
  onDownloadSelected: () => void;
  /** Resolves true on successful copy so the button can show inline feedback. */
  onCopyLink: () => Promise<boolean>;
  /** Opens the share dialog (TTL + QR). Triggered by Alt+click on the Copy
   *  link button — same single-file constraint as onCopyLink. */
  onShare: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const isSelectionMode = selectedCount > 0;
  // Rename only makes sense for a single entry.
  const canRename = selectedCount === 1;
  // Copy-link is single-file only (folders don't have a presignable target).
  const canCopyLink = selectedCount === 1;

  const [copied, flashCopied] = useCopied();
  const handleCopyLinkClick = async (e: React.MouseEvent) => {
    // Hold Alt → open the share dialog instead of the silent one-shot copy.
    if (e.altKey) {
      onShare();
      return;
    }
    const ok = await onCopyLink();
    if (ok) flashCopied();
  };

  return (
    <div
      className={cn(
        "border-border relative flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 transition-colors sm:gap-4",
        isSelectionMode && "bg-muted/30",
        className
      )}
    >
      {isSelectionMode ? (
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <div className="bg-primary-text/20 text-primary-text border-primary-text/30 flex shrink-0 items-center gap-2 rounded border px-2 py-1 font-mono text-xs font-bold whitespace-nowrap">
            <CheckSquare className="size-3.5 shrink-0" />
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-[11px] underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button onClick={onUpload}>
            <UploadCloud />
            Upload
          </Button>
          <Button variant="outline" onClick={onNewFolder}>
            <FolderPlus className="text-accent-blue" />
            New folder
          </Button>
          <CompressBadge />
        </div>
      )}

      <div className="flex min-w-0 items-center gap-3">
        {isSelectionMode ? (
          <div className="-mx-2 flex min-w-0 items-center gap-1 overflow-x-auto px-2 font-mono text-xs [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            <ActionButton
              onClick={onPreview}
              icon={<Eye />}
              disabled={!canPreview}
              title={canPreview ? undefined : "Select a single file"}
            >
              Preview
            </ActionButton>
            <ActionButton onClick={onDownloadSelected} icon={<Download />}>
              Download
            </ActionButton>
            <ActionButton
              onClick={handleCopyLinkClick}
              icon={
                copied ? (
                  <CheckIcon className="text-success" />
                ) : (
                  <LinkIcon />
                )
              }
              disabled={!canCopyLink}
              title={
                canCopyLink
                  ? "Click to copy 15-min link · Alt-click for share options"
                  : "Select a single file"
              }
              className={copied ? "text-success" : undefined}
            >
              {copied ? "Copied" : "Copy link"}
            </ActionButton>
            <ActionButton
              onClick={onShare}
              icon={<Share />}
              disabled={!canCopyLink}
              title={
                canCopyLink
                  ? "Share with custom expiry + QR"
                  : "Select a single file"
              }
            >
              Share
            </ActionButton>
            <ActionButton onClick={onMove} icon={<FolderOutput />}>
              Move
            </ActionButton>
            <ActionButton
              onClick={onRename}
              icon={<PenLine />}
              disabled={!canRename}
              title={canRename ? undefined : "Select a single item"}
            >
              Rename
            </ActionButton>
            <div className="bg-surface-1 mx-1 h-4 w-px shrink-0" />
            <ActionButton onClick={onDelete} icon={<Trash2 />} destructive>
              Delete
            </ActionButton>
          </div>
        ) : (
          <FilterInput
            value={filter}
            onChange={onFilterChange}
            inputRef={filterInputRef}
          />
        )}

        {!isSelectionMode && (
          <div className="text-muted-foreground hidden gap-3 font-mono text-[11px] whitespace-nowrap md:flex">
            <span>{formatCount(totalCount)} items</span>
            <span className="text-muted-foreground">|</span>
            <span>{formatBytes(totalBytes)} total</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterInput({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="relative hidden sm:block">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search in folder..."
        className="bg-input-bg border-border text-foreground focus:border-primary-text placeholder:text-surface-1 w-48 rounded border py-1.5 pr-3 pl-8 font-mono text-xs transition-colors focus:outline-none"
      />
    </div>
  );
}

/** Toolbar pill that mirrors and toggles the global `compressImages` pref.
 *  Always visible while the user can see Upload/New folder so they can flip
 *  the behavior just before dropping or picking files — single source of
 *  truth, same value the Settings page reads. */
function CompressBadge() {
  const compressImages = usePrefsStore((s) => s.compressImages);
  const patch = usePrefsStore((s) => s.patch);
  return (
    <button
      type="button"
      onClick={() => patch({ compressImages: !compressImages })}
      title={
        compressImages
          ? "Images will be re-encoded at 80% quality before upload. Click to upload originals instead."
          : "Originals upload as-is. Click to enable image compression (smaller files, same visual quality)."
      }
      className={cn(
        "hidden h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] transition-colors sm:inline-flex",
        compressImages
          ? "border-accent-green/40 bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
          : "border-surface-1 bg-input-bg text-muted-foreground hover:text-foreground hover:border-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          compressImages ? "bg-accent-green" : "bg-muted-foreground/50"
        )}
      />
      Compress {compressImages ? "on" : "off"}
    </button>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
  destructive,
  disabled,
  title,
  className,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
  icon: React.ReactNode;
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 whitespace-nowrap focus:outline-none",
        destructive
          ? "text-destructive hover:bg-destructive/20"
          : "text-foreground hover:bg-surface-1",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
        className
      )}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {children}
    </button>
  );
}
