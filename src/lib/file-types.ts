/**
 * Map a file's extension to an icon + accent color + human label. Used by the
 * object list rows so the same kind of file always reads the same at a glance.
 * Unknown extensions fall back to a generic file icon in subtext color.
 */

// File-type icons use the FILL variant of Material Symbols so each row reads
// boldly on the dark surface — the outlined variants at weight 400 disappear
// into the background. Imported directly (not via `@/lib/icons`) so the UI
// chrome can keep its outlined Settings while config files in the list use
// the filled variant.
import Archive from "@material-symbols/svg-400/outlined/folder_zip-fill.svg?react";
import File from "@material-symbols/svg-400/outlined/draft-fill.svg?react";
import FileAudio from "@material-symbols/svg-400/outlined/audio_file-fill.svg?react";
import FileCode from "@material-symbols/svg-400/outlined/code_blocks-fill.svg?react";
import FileSpreadsheet from "@material-symbols/svg-400/outlined/table_view-fill.svg?react";
import FileText from "@material-symbols/svg-400/outlined/description-fill.svg?react";
import FileVideo from "@material-symbols/svg-400/outlined/video_file-fill.svg?react";
import Image from "@material-symbols/svg-400/outlined/image-fill.svg?react";
import Package from "@material-symbols/svg-400/outlined/deployed_code-fill.svg?react";
import Settings from "@material-symbols/svg-400/outlined/settings-fill.svg?react";
import { type LucideIcon } from "@/lib/icons";

export interface FileAppearance {
  Icon: LucideIcon;
  /** Tailwind text-color class for the icon. */
  color: string;
  /** Human-readable type label shown in the Type column. */
  label: string;
}

const FALLBACK: FileAppearance = {
  Icon: File,
  color: "text-foreground",
  label: "File",
};

const BY_EXT: Record<string, FileAppearance> = {
  // Images — warm/cool split so JPEG vs PNG reads at a glance
  jpg: { Icon: Image, color: "text-accent-peach", label: "JPEG" },
  jpeg: { Icon: Image, color: "text-accent-peach", label: "JPEG" },
  png: { Icon: Image, color: "text-accent-sky", label: "PNG" },
  gif: { Icon: Image, color: "text-accent-pink", label: "GIF" },
  webp: { Icon: Image, color: "text-accent-sky", label: "WebP" },
  svg: { Icon: Image, color: "text-accent-mauve", label: "SVG" },
  avif: { Icon: Image, color: "text-accent-sky", label: "AVIF" },
  heic: { Icon: Image, color: "text-accent-peach", label: "HEIC" },

  // Video — saturated pink
  mp4: { Icon: FileVideo, color: "text-accent-pink", label: "MP4 Video" },
  mov: { Icon: FileVideo, color: "text-accent-pink", label: "QuickTime" },
  mkv: { Icon: FileVideo, color: "text-accent-pink", label: "MKV Video" },
  webm: { Icon: FileVideo, color: "text-accent-pink", label: "WebM" },
  avi: { Icon: FileVideo, color: "text-accent-pink", label: "AVI" },

  // Audio — vivid teal so it doesn't clash with code-green
  mp3: { Icon: FileAudio, color: "text-accent-teal", label: "MP3 Audio" },
  wav: { Icon: FileAudio, color: "text-accent-teal", label: "WAV Audio" },
  flac: { Icon: FileAudio, color: "text-accent-teal", label: "FLAC" },
  ogg: { Icon: FileAudio, color: "text-accent-teal", label: "OGG" },
  m4a: { Icon: FileAudio, color: "text-accent-teal", label: "M4A" },

  // Docs — PDF gets the brightest red (maroon reads more red than accent-red,
  // which leans pink); Word stays sapphire to match its brand
  pdf: { Icon: FileText, color: "text-accent-maroon", label: "PDF" },
  doc: { Icon: FileText, color: "text-accent-sapphire", label: "Word" },
  docx: { Icon: FileText, color: "text-accent-sapphire", label: "Word" },
  rtf: { Icon: FileText, color: "text-foreground", label: "RTF" },
  txt: { Icon: FileText, color: "text-foreground", label: "Text" },
  md: { Icon: FileCode, color: "text-accent-lavender", label: "Markdown" },
  csv: { Icon: FileSpreadsheet, color: "text-accent-green", label: "CSV" },
  xls: { Icon: FileSpreadsheet, color: "text-accent-green", label: "Excel" },
  xlsx: { Icon: FileSpreadsheet, color: "text-accent-green", label: "Excel" },

  // Code — keep the language→color associations devs expect
  js: { Icon: FileCode, color: "text-accent-yellow", label: "JavaScript" },
  mjs: { Icon: FileCode, color: "text-accent-yellow", label: "JavaScript" },
  cjs: { Icon: FileCode, color: "text-accent-yellow", label: "JavaScript" },
  ts: { Icon: FileCode, color: "text-accent-blue", label: "TypeScript" },
  tsx: { Icon: FileCode, color: "text-accent-blue", label: "TSX" },
  jsx: { Icon: FileCode, color: "text-accent-sky", label: "JSX" },
  json: { Icon: FileCode, color: "text-accent-yellow", label: "JSON" },
  html: { Icon: FileCode, color: "text-accent-peach", label: "HTML" },
  css: { Icon: FileCode, color: "text-accent-sky", label: "CSS" },
  py: { Icon: FileCode, color: "text-accent-yellow", label: "Python" },
  rs: { Icon: FileCode, color: "text-accent-peach", label: "Rust" },
  go: { Icon: FileCode, color: "text-accent-sapphire", label: "Go" },
  java: { Icon: FileCode, color: "text-accent-maroon", label: "Java" },
  c: { Icon: FileCode, color: "text-accent-sapphire", label: "C" },
  cpp: { Icon: FileCode, color: "text-accent-sapphire", label: "C++" },
  sh: { Icon: FileCode, color: "text-accent-green", label: "Shell" },
  toml: { Icon: Settings, color: "text-foreground", label: "TOML" },
  yaml: { Icon: Settings, color: "text-foreground", label: "YAML" },
  yml: { Icon: Settings, color: "text-foreground", label: "YAML" },
  env: { Icon: Settings, color: "text-accent-yellow", label: "Env" },

  // Archives — lavender (brighter than mauve, distinct from code-blue)
  zip: { Icon: Archive, color: "text-accent-lavender", label: "ZIP Archive" },
  tar: { Icon: Archive, color: "text-accent-lavender", label: "Tar Archive" },
  gz: { Icon: Archive, color: "text-accent-lavender", label: "GZip" },
  bz2: { Icon: Archive, color: "text-accent-lavender", label: "BZip2" },
  "7z": { Icon: Archive, color: "text-accent-lavender", label: "7-Zip" },
  rar: { Icon: Archive, color: "text-accent-lavender", label: "RAR" },

  // Disk images / binaries
  iso: { Icon: Package, color: "text-foreground", label: "ISO Image" },
  dmg: { Icon: Package, color: "text-foreground", label: "Disk Image" },
  exe: { Icon: Package, color: "text-accent-maroon", label: "Executable" },
};

export function fileAppearance(name: string): FileAppearance {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === name.length - 1) return FALLBACK;
  const ext = name.slice(dot + 1).toLowerCase();
  return BY_EXT[ext] ?? FALLBACK;
}

/**
 * What kind of inline preview should the panel render. Distinct from
 * `fileAppearance` (which is about icon + label) — preview kind drives a
 * different code path per body type, and the supported extension set is
 * narrower than what we display icons for.
 */
export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "pdf"
  | "unsupported";

const PREVIEW_KIND_BY_EXT: Record<string, PreviewKind> = {
  // Images the browser can render natively.
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  avif: "image",
  // (HEIC intentionally omitted — most browsers can't decode it.)

  // Video the <video> element handles broadly.
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  // (mkv / avi intentionally omitted — inconsistent browser support.)

  // Audio.
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  flac: "audio",

  pdf: "pdf",

  // Plain text + code we render in a <pre>. Anything plausibly UTF-8.
  txt: "text",
  md: "text",
  log: "text",
  csv: "text",
  tsv: "text",
  json: "text",
  yaml: "text",
  yml: "text",
  toml: "text",
  xml: "text",
  ini: "text",
  conf: "text",
  env: "text",
  js: "text",
  mjs: "text",
  cjs: "text",
  ts: "text",
  tsx: "text",
  jsx: "text",
  html: "text",
  css: "text",
  scss: "text",
  py: "text",
  rs: "text",
  go: "text",
  java: "text",
  c: "text",
  cpp: "text",
  h: "text",
  hpp: "text",
  sh: "text",
  bash: "text",
  zsh: "text",
  rb: "text",
  php: "text",
  sql: "text",
  graphql: "text",
  gql: "text",
  dockerfile: "text",
};

export function previewKind(name: string): PreviewKind {
  const lower = name.toLowerCase();
  // Extensionless but well-known filenames.
  if (lower === "dockerfile" || lower === "makefile" || lower === "readme") {
    return "text";
  }
  const dot = lower.lastIndexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "unsupported";
  const ext = lower.slice(dot + 1);
  return PREVIEW_KIND_BY_EXT[ext] ?? "unsupported";
}
