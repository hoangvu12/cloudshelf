import * as React from "react";
import {
  CheckIcon,
  CheckSquare,
  ChevronDown,
  Database,
  Download,
  Eye,
  FolderOutput,
  FolderPlus,
  FolderUp,
  FolderZip,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopied } from "@/lib/use-copied";
import { usePrefsStore } from "@/stores/prefs";
import { useUploadSessionStore } from "@/stores/upload-session";

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
  onUploadFolder,
  onUploadFromUrl,
  onNewFolder,
  onClearSelection,
  onPreview,
  canPreview,
  onDownloadSelected,
  onDownloadAsZip,
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
  /** Triggers the directory picker. Drag-drop of folders works without this
   *  via the dropzone, but a discoverable button is worth the extra slot. */
  onUploadFolder: () => void;
  /** Opens the "From URL" dialog — server-side streaming upload (no Uppy
   *  involvement, no bytes through the browser). */
  onUploadFromUrl: () => void;
  onNewFolder: () => void;
  onClearSelection: () => void;
  onPreview: () => void;
  /** True when exactly one file (not folder) is selected. */
  canPreview: boolean;
  onDownloadSelected: () => void;
  /** Stream the selection (files + recursive folders) into a single .zip. */
  onDownloadAsZip: () => void;
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
          <UploadMenu
            onUpload={onUpload}
            onUploadFolder={onUploadFolder}
            onUploadFromUrl={onUploadFromUrl}
          />
          <Button variant="outline" onClick={onNewFolder}>
            <FolderPlus className="text-accent-blue" />
            New folder
          </Button>
          <CompressBadge />
          <StorageClassBadge />
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
              onClick={onDownloadAsZip}
              icon={<FolderZip />}
              title="Bundle the selection (folders included, recursively) into a single .zip"
            >
              Download as ZIP
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

/**
 * Single Upload button that opens a dropdown with the three upload paths
 * (files, folder, from-URL). Double-click on the button bypasses the menu
 * and goes straight to the file picker — that's the most common path, so
 * the shortcut is worth the tiny "menu flash" the second click causes
 * (Radix toggles the menu open on click 1, closed on click 2, then
 * onDoubleClick fires and triggers the picker).
 */
function UploadMenu({
  onUpload,
  onUploadFolder,
  onUploadFromUrl,
}: {
  onUpload: () => void;
  onUploadFolder: () => void;
  onUploadFromUrl: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <UploadCloud />
          Upload
          <ChevronDown className="-mr-0.5 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={onUpload} className="whitespace-nowrap">
          <UploadCloud />
          Upload files
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onUploadFolder} className="whitespace-nowrap">
          <FolderUp />
          Upload folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onUploadFromUrl} className="whitespace-nowrap">
          <LinkIcon />
          From URL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

/** Canonical AWS storage classes plus the implicit "Default" sentinel. Forwarded
 *  to S3-compatible endpoints that don't recognize them are silently treated as
 *  STANDARD by most servers, which satisfies the Phase 9 "graceful no-op"
 *  requirement. */
const STORAGE_CLASS_OPTIONS: { value: string; label: string; hint?: string }[] =
  [
    { value: "STANDARD", label: "STANDARD", hint: "Default hot storage" },
    { value: "STANDARD_IA", label: "STANDARD_IA", hint: "Infrequent access" },
    {
      value: "INTELLIGENT_TIERING",
      label: "INTELLIGENT_TIERING",
      hint: "Auto-tiering",
    },
    { value: "ONEZONE_IA", label: "ONEZONE_IA", hint: "Single-AZ IA" },
    { value: "GLACIER_IR", label: "GLACIER_IR", hint: "Instant retrieval" },
    { value: "GLACIER", label: "GLACIER", hint: "Archive (minutes-hours)" },
    { value: "DEEP_ARCHIVE", label: "DEEP_ARCHIVE", hint: "Archive (hours)" },
    {
      value: "REDUCED_REDUNDANCY",
      label: "REDUCED_REDUNDANCY",
      hint: "Legacy, AWS-only",
    },
  ];

/** Storage-class picker for the next upload batch. Reading order is
 *  session override → persisted default pref → undefined. Selecting "Default"
 *  clears the session override only; the persisted pref is left alone. Lives
 *  next to CompressBadge so both per-upload knobs share the same visual rhythm.
 */
function StorageClassBadge() {
  const sessionClass = useUploadSessionStore((s) => s.storageClass);
  const setSessionClass = useUploadSessionStore((s) => s.setStorageClass);
  const defaultClass = usePrefsStore((s) => s.defaultStorageClass);
  const effective = sessionClass ?? defaultClass;
  const active = effective !== undefined;
  const label = effective ?? "Default";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Storage class for the next upload batch"
          className={cn(
            "hidden h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] transition-colors sm:inline-flex",
            active
              ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
              : "border-surface-1 bg-input-bg text-muted-foreground hover:text-foreground hover:border-muted-foreground"
          )}
        >
          <Database className="size-3" />
          <span>Storage:</span>
          <span className={active ? undefined : "text-foreground"}>{label}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
          Storage class
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => setSessionClass(undefined)}
          className="flex items-start gap-2"
        >
          <div className="flex w-4 shrink-0 items-center justify-center pt-0.5">
            {effective === undefined && <CheckIcon className="size-3.5" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground text-xs">Default</span>
            <span className="text-muted-foreground text-[10px]">
              Let the backend pick
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {STORAGE_CLASS_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => setSessionClass(opt.value)}
            className="flex items-start gap-2"
          >
            <div className="flex w-4 shrink-0 items-center justify-center pt-0.5">
              {effective === opt.value && <CheckIcon className="size-3.5" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground font-mono text-[11px]">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="text-muted-foreground text-[10px]">
                  {opt.hint}
                </span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
