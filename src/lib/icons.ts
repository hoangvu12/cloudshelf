/**
 * Single barrel for chrome icons. Each entry is a Material Symbols glyph at
 * weight 400, **filled** variant — solid shapes read better than thin outlines
 * on the dark Catppuccin surface, and going uniform avoids a mixed look.
 *
 * Adding a new icon:
 *   1. Find the symbol at https://fonts.google.com/icons (Outlined family)
 *   2. import the `-fill.svg` variant and re-export under whatever name the
 *      call-sites want (we mirror Lucide naming for drop-in convenience)
 *
 * Sizing/coloring: each component renders as `<svg fill="currentColor">`, so
 * Tailwind `text-*` controls color and `size-N` / `w-N h-N` controls size.
 *
 * File-type icons live in `lib/file-types.ts` (which imports the `-fill`
 * variants directly), and per-folder-type icons live in `lib/folder-icons.ts`
 * (Material Icon Theme). This module is just the navigation/chrome set.
 *
 * Brand marks (Github, etc.) aren't in Material Symbols — that one icon is
 * re-exported from `lucide-react` so call-sites only import from here.
 */

// Navigation / layout
export { default as ChevronsUpDown } from "@material-symbols/svg-400/outlined/unfold_more-fill.svg?react";
export { default as ChevronDown } from "@material-symbols/svg-400/outlined/keyboard_arrow_down-fill.svg?react";
export { default as ChevronUp } from "@material-symbols/svg-400/outlined/keyboard_arrow_up-fill.svg?react";
export { default as ChevronLeft } from "@material-symbols/svg-400/outlined/chevron_left-fill.svg?react";
export { default as ChevronRight } from "@material-symbols/svg-400/outlined/chevron_right-fill.svg?react";
export { default as ArrowUp } from "@material-symbols/svg-400/outlined/arrow_upward-fill.svg?react";
export { default as ArrowLeft } from "@material-symbols/svg-400/outlined/arrow_back-fill.svg?react";
export { default as ArrowRight } from "@material-symbols/svg-400/outlined/arrow_forward-fill.svg?react";
export { default as CornerDownRight } from "@material-symbols/svg-400/outlined/subdirectory_arrow_right-fill.svg?react";
export { default as Home } from "@material-symbols/svg-400/outlined/home-fill.svg?react";
export { default as Search } from "@material-symbols/svg-400/outlined/search-fill.svg?react";
export { default as MoreHorizontal } from "@material-symbols/svg-400/outlined/more_horiz-fill.svg?react";
export { default as Pin } from "@material-symbols/svg-400/outlined/keep-fill.svg?react";

// Folder/file chrome (not the colorful per-type folder icons — those are in
// folder-icons.ts. These are for breadcrumbs, "create folder" actions, empty
// states, etc.)
export { default as FolderOpen } from "@material-symbols/svg-400/outlined/folder_open-fill.svg?react";
export { default as FolderPlus } from "@material-symbols/svg-400/outlined/create_new_folder-fill.svg?react";
export { default as FolderOutput } from "@material-symbols/svg-400/outlined/drive_file_move-fill.svg?react";
export { default as FolderUp } from "@material-symbols/svg-400/outlined/drive_folder_upload-fill.svg?react";
export { default as FolderX } from "@material-symbols/svg-400/outlined/folder_off-fill.svg?react";
export { default as FileQuestion } from "@material-symbols/svg-400/outlined/quiz-fill.svg?react";

// Storage / infra
export { default as Database } from "@material-symbols/svg-400/outlined/database-fill.svg?react";
export { default as Server } from "@material-symbols/svg-400/outlined/dns-fill.svg?react";
export { default as ServerCrash } from "@material-symbols/svg-400/outlined/report-fill.svg?react";
export { default as ServerOff } from "@material-symbols/svg-400/outlined/cloud_off-fill.svg?react";
export { default as Cloud } from "@material-symbols/svg-400/outlined/cloud-fill.svg?react";
export { default as CloudUpload } from "@material-symbols/svg-400/outlined/cloud_upload-fill.svg?react";
export { default as UploadCloud } from "@material-symbols/svg-400/outlined/cloud_upload-fill.svg?react";
export { default as Plug } from "@material-symbols/svg-400/outlined/power-fill.svg?react";

// Actions
export { default as Plus } from "@material-symbols/svg-400/outlined/add-fill.svg?react";
export { default as Minus } from "@material-symbols/svg-400/outlined/remove-fill.svg?react";
export { default as X } from "@material-symbols/svg-400/outlined/close-fill.svg?react";
export { default as XCircle } from "@material-symbols/svg-400/outlined/cancel-fill.svg?react";
export { default as Download } from "@material-symbols/svg-400/outlined/download-fill.svg?react";
export { default as ExternalLink } from "@material-symbols/svg-400/outlined/open_in_new-fill.svg?react";
export { default as Link } from "@material-symbols/svg-400/outlined/link-fill.svg?react";
export { default as Share } from "@material-symbols/svg-400/outlined/share-fill.svg?react";
export { default as Copy } from "@material-symbols/svg-400/outlined/content_copy-fill.svg?react";
export { default as Edit2 } from "@material-symbols/svg-400/outlined/edit-fill.svg?react";
export { default as PenLine } from "@material-symbols/svg-400/outlined/edit_note-fill.svg?react";
export { default as Trash2 } from "@material-symbols/svg-400/outlined/delete-fill.svg?react";
export { default as RotateCw } from "@material-symbols/svg-400/outlined/refresh-fill.svg?react";
export { default as Maximize2 } from "@material-symbols/svg-400/outlined/open_in_full-fill.svg?react";
export { default as Pause } from "@material-symbols/svg-400/outlined/pause-fill.svg?react";
export { default as Play } from "@material-symbols/svg-400/outlined/play_arrow-fill.svg?react";
export { default as Lock } from "@material-symbols/svg-400/outlined/lock-fill.svg?react";
export { default as LogOut } from "@material-symbols/svg-400/outlined/logout-fill.svg?react";
export { default as Eye } from "@material-symbols/svg-400/outlined/visibility-fill.svg?react";
export { default as EyeOff } from "@material-symbols/svg-400/outlined/visibility_off-fill.svg?react";
export { default as CheckSquare } from "@material-symbols/svg-400/outlined/check_box-fill.svg?react";

// Settings / meta
export { default as Settings } from "@material-symbols/svg-400/outlined/settings-fill.svg?react";
export { default as Clock } from "@material-symbols/svg-400/outlined/schedule-fill.svg?react";
export { default as BookOpen } from "@material-symbols/svg-400/outlined/menu_book-fill.svg?react";
export { default as Bug } from "@material-symbols/svg-400/outlined/bug_report-fill.svg?react";
export { default as Keyboard } from "@material-symbols/svg-400/outlined/keyboard-fill.svg?react";
export { default as Monitor } from "@material-symbols/svg-400/outlined/desktop_windows-fill.svg?react";
export { default as Grid } from "@material-symbols/svg-400/outlined/grid_view-fill.svg?react";
export { default as List } from "@material-symbols/svg-400/outlined/view_list-fill.svg?react";

// Status
export { default as Info } from "@material-symbols/svg-400/outlined/info-fill.svg?react";
export { default as AlertCircle } from "@material-symbols/svg-400/outlined/error-fill.svg?react";
export { default as AlertTriangle } from "@material-symbols/svg-400/outlined/warning-fill.svg?react";
export { default as CheckCircle2 } from "@material-symbols/svg-400/outlined/check_circle-fill.svg?react";

// shadcn ui/* primitives reference these `*Icon` names — re-export under both
// the short and long forms so we don't need to edit shadcn-generated files.
export { default as CheckIcon } from "@material-symbols/svg-400/outlined/check-fill.svg?react";
export { default as XIcon } from "@material-symbols/svg-400/outlined/close-fill.svg?react";
export { default as ChevronRightIcon } from "@material-symbols/svg-400/outlined/chevron_right-fill.svg?react";
export { default as ChevronDownIcon } from "@material-symbols/svg-400/outlined/keyboard_arrow_down-fill.svg?react";
export { default as ChevronUpIcon } from "@material-symbols/svg-400/outlined/keyboard_arrow_up-fill.svg?react";
export { default as CircleIcon } from "@material-symbols/svg-400/outlined/fiber_manual_record-fill.svg?react";
export { default as CircleCheckIcon } from "@material-symbols/svg-400/outlined/check_circle-fill.svg?react";
export { default as InfoIcon } from "@material-symbols/svg-400/outlined/info-fill.svg?react";
export { default as OctagonXIcon } from "@material-symbols/svg-400/outlined/block-fill.svg?react";
export { default as TriangleAlertIcon } from "@material-symbols/svg-400/outlined/warning-fill.svg?react";

// Spinner — `progress_activity` is the official animated one; we drive the
// rotation via `animate-spin` for consistency with the rest of the codebase.
export { default as Loader2 } from "@material-symbols/svg-400/outlined/progress_activity-fill.svg?react";
export { default as Loader2Icon } from "@material-symbols/svg-400/outlined/progress_activity-fill.svg?react";

// Brand marks aren't part of Material Symbols. Keep the one we need from
// Lucide so call-sites still import from a single module.
export { Github } from "lucide-react";

// Re-export the prop type for components that accept "an icon component".
import type { FC, SVGProps } from "react";
export type IconComponent = FC<SVGProps<SVGSVGElement>>;
/** Legacy alias for files migrated from `lucide-react`. */
export type LucideIcon = IconComponent;
