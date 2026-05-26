/**
 * Map a file's extension to an icon + accent color + human label. Used by the
 * object list rows so the same kind of file always reads the same at a glance.
 * Unknown extensions fall back to a generic file icon in subtext color.
 */

import {
  Archive,
  File,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface FileAppearance {
  Icon: LucideIcon;
  /** Tailwind text-color class for the icon. */
  color: string;
  /** Human-readable type label shown in the Type column. */
  label: string;
}

const FALLBACK: FileAppearance = {
  Icon: File,
  color: "text-ctp-subtext",
  label: "File",
};

const BY_EXT: Record<string, FileAppearance> = {
  // Images
  jpg: { Icon: Image, color: "text-ctp-yellow", label: "JPEG" },
  jpeg: { Icon: Image, color: "text-ctp-yellow", label: "JPEG" },
  png: { Icon: Image, color: "text-ctp-sapphire", label: "PNG" },
  gif: { Icon: Image, color: "text-ctp-pink", label: "GIF" },
  webp: { Icon: Image, color: "text-ctp-sapphire", label: "WebP" },
  svg: { Icon: Image, color: "text-ctp-mauve", label: "SVG" },
  avif: { Icon: Image, color: "text-ctp-sapphire", label: "AVIF" },
  heic: { Icon: Image, color: "text-ctp-yellow", label: "HEIC" },

  // Video
  mp4: { Icon: FileVideo, color: "text-ctp-pink", label: "MP4 Video" },
  mov: { Icon: FileVideo, color: "text-ctp-pink", label: "QuickTime" },
  mkv: { Icon: FileVideo, color: "text-ctp-pink", label: "MKV Video" },
  webm: { Icon: FileVideo, color: "text-ctp-pink", label: "WebM" },
  avi: { Icon: FileVideo, color: "text-ctp-pink", label: "AVI" },

  // Audio
  mp3: { Icon: FileAudio, color: "text-ctp-green", label: "MP3 Audio" },
  wav: { Icon: FileAudio, color: "text-ctp-green", label: "WAV Audio" },
  flac: { Icon: FileAudio, color: "text-ctp-green", label: "FLAC" },
  ogg: { Icon: FileAudio, color: "text-ctp-green", label: "OGG" },
  m4a: { Icon: FileAudio, color: "text-ctp-green", label: "M4A" },

  // Docs
  pdf: { Icon: FileText, color: "text-ctp-red", label: "PDF" },
  doc: { Icon: FileText, color: "text-ctp-sapphire", label: "Word" },
  docx: { Icon: FileText, color: "text-ctp-sapphire", label: "Word" },
  rtf: { Icon: FileText, color: "text-ctp-subtext", label: "RTF" },
  txt: { Icon: FileText, color: "text-ctp-subtext", label: "Text" },
  md: { Icon: FileCode, color: "text-ctp-mauve", label: "Markdown" },
  csv: { Icon: FileSpreadsheet, color: "text-ctp-green", label: "CSV" },
  xls: { Icon: FileSpreadsheet, color: "text-ctp-green", label: "Excel" },
  xlsx: { Icon: FileSpreadsheet, color: "text-ctp-green", label: "Excel" },

  // Code
  js: { Icon: FileCode, color: "text-ctp-yellow", label: "JavaScript" },
  mjs: { Icon: FileCode, color: "text-ctp-yellow", label: "JavaScript" },
  cjs: { Icon: FileCode, color: "text-ctp-yellow", label: "JavaScript" },
  ts: { Icon: FileCode, color: "text-ctp-sapphire", label: "TypeScript" },
  tsx: { Icon: FileCode, color: "text-ctp-sapphire", label: "TSX" },
  jsx: { Icon: FileCode, color: "text-ctp-sapphire", label: "JSX" },
  json: { Icon: FileCode, color: "text-ctp-yellow", label: "JSON" },
  html: { Icon: FileCode, color: "text-ctp-pink", label: "HTML" },
  css: { Icon: FileCode, color: "text-ctp-sapphire", label: "CSS" },
  py: { Icon: FileCode, color: "text-ctp-yellow", label: "Python" },
  rs: { Icon: FileCode, color: "text-ctp-pink", label: "Rust" },
  go: { Icon: FileCode, color: "text-ctp-sapphire", label: "Go" },
  java: { Icon: FileCode, color: "text-ctp-red", label: "Java" },
  c: { Icon: FileCode, color: "text-ctp-sapphire", label: "C" },
  cpp: { Icon: FileCode, color: "text-ctp-sapphire", label: "C++" },
  sh: { Icon: FileCode, color: "text-ctp-green", label: "Shell" },
  toml: { Icon: Settings, color: "text-ctp-subtext", label: "TOML" },
  yaml: { Icon: Settings, color: "text-ctp-subtext", label: "YAML" },
  yml: { Icon: Settings, color: "text-ctp-subtext", label: "YAML" },
  env: { Icon: Settings, color: "text-ctp-yellow", label: "Env" },

  // Archives
  zip: { Icon: Archive, color: "text-ctp-mauve", label: "ZIP Archive" },
  tar: { Icon: Archive, color: "text-ctp-mauve", label: "Tar Archive" },
  gz: { Icon: Archive, color: "text-ctp-mauve", label: "GZip" },
  bz2: { Icon: Archive, color: "text-ctp-mauve", label: "BZip2" },
  "7z": { Icon: Archive, color: "text-ctp-mauve", label: "7-Zip" },
  rar: { Icon: Archive, color: "text-ctp-mauve", label: "RAR" },

  // Disk images / binaries
  iso: { Icon: Package, color: "text-ctp-subtext", label: "ISO Image" },
  dmg: { Icon: Package, color: "text-ctp-subtext", label: "Disk Image" },
  exe: { Icon: Package, color: "text-ctp-red", label: "Executable" },
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
