import * as React from "react";
import {
  CheckSquare,
  Download,
  Eye,
  FolderOutput,
  FolderPlus,
  Link as LinkIcon,
  PenLine,
  Search,
  Trash2,
  UploadCloud,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes, formatCount } from "@/lib/format";

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
  onUpload,
  onNewFolder,
  onClearSelection,
  onPreview,
  canPreview,
  onDownloadSelected,
  onCopyLink,
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
  onUpload: () => void;
  onNewFolder: () => void;
  onClearSelection: () => void;
  onPreview: () => void;
  /** True when exactly one file (not folder) is selected. */
  canPreview: boolean;
  onDownloadSelected: () => void;
  onCopyLink: () => void;
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

  return (
    <div
      className={cn(
        "border-ctp-surface0 relative flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 transition-colors",
        isSelectionMode && "bg-ctp-surface0/30",
        className
      )}
    >
      {isSelectionMode ? (
        <div className="flex items-center gap-4">
          <div className="bg-ctp-mauve/20 text-ctp-mauve border-ctp-mauve/30 flex items-center gap-2 rounded border px-2 py-1 font-mono text-xs font-bold">
            <CheckSquare className="size-3.5" />
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-ctp-subtext hover:text-ctp-text font-mono text-[11px] underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={onUpload}>
            <UploadCloud className="size-4" />
            Upload
          </PrimaryButton>
          <SecondaryButton onClick={onNewFolder}>
            <FolderPlus className="text-ctp-blue size-4" />
            New folder
          </SecondaryButton>
        </div>
      )}

      <div className="flex items-center gap-3">
        {isSelectionMode ? (
          <div className="flex items-center gap-1 font-mono text-xs">
            <ActionButton
              onClick={onPreview}
              icon={<Eye className="text-ctp-mauve" />}
              disabled={!canPreview}
              title={canPreview ? undefined : "Select a single file"}
            >
              Preview
            </ActionButton>
            <ActionButton onClick={onDownloadSelected} icon={<Download className="text-ctp-green" />}>
              Download
            </ActionButton>
            <ActionButton
              onClick={onCopyLink}
              icon={<LinkIcon className="text-ctp-sapphire" />}
              disabled={!canCopyLink}
              title={canCopyLink ? undefined : "Select a single file"}
            >
              Copy link
            </ActionButton>
            <ActionButton onClick={onMove} icon={<FolderOutput className="text-ctp-yellow" />}>
              Move
            </ActionButton>
            <ActionButton
              onClick={onRename}
              icon={<PenLine className="text-ctp-subtext" />}
              disabled={!canRename}
              title={canRename ? undefined : "Select a single item"}
            >
              Rename
            </ActionButton>
            <div className="bg-ctp-surface1 mx-1 h-4 w-px" />
            <ActionButton onClick={onDelete} icon={<Trash2 />} destructive>
              Delete
            </ActionButton>
          </div>
        ) : (
          <FilterInput value={filter} onChange={onFilterChange} />
        )}

        {!isSelectionMode && (
          <div className="text-ctp-subtext flex gap-3 font-mono text-[11px]">
            <span>{formatCount(totalCount)} items</span>
            <span className="text-ctp-surface1">|</span>
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
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative hidden sm:block">
      <Search className="text-ctp-subtext absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search in folder..."
        className="bg-ctp-crust border-ctp-surface0 text-ctp-text focus:border-ctp-mauve placeholder:text-ctp-surface1 w-48 rounded border py-1.5 pr-3 pl-8 font-mono text-xs transition-colors focus:outline-none"
      />
    </div>
  );
}

function PrimaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-primary text-primary-foreground flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs font-bold transition-opacity hover:opacity-90 focus:outline-none"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text border-ctp-surface1 flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs transition-colors focus:outline-none"
    >
      {children}
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
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 focus:outline-none",
        destructive
          ? "text-ctp-red hover:bg-ctp-red/20"
          : "text-ctp-text hover:bg-ctp-surface1",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
      )}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {children}
    </button>
  );
}
