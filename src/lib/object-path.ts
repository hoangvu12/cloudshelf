/**
 * Pure helpers for S3 key/prefix math. Kept dependency-free so the same
 * functions work in tests and on the server if we ever need them there.
 */

import type { S3Entry } from "@server/types";

/** "photos/2025/IMG.jpg" → "IMG.jpg"  /  "photos/2025/" → "2025" */
export function basename(keyOrPrefix: string): string {
  const trimmed = keyOrPrefix.endsWith("/")
    ? keyOrPrefix.slice(0, -1)
    : keyOrPrefix;
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/** Parent prefix including trailing slash. "photos/2025/IMG.jpg" → "photos/2025/" */
export function dirname(key: string): string {
  const idx = key.lastIndexOf("/");
  return idx === -1 ? "" : key.slice(0, idx + 1);
}

/** Always returns the empty string or a string ending in "/". */
export function normalizePrefix(prefix: string): string {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : prefix + "/";
}

/** Drop the trailing slash on a prefix for display ("photos/" → "photos"). */
export function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/** Split a prefix into displayable segments. "photos/2025/" → ["photos", "2025"] */
export function prefixSegments(prefix: string): string[] {
  const trimmed = trimTrailingSlash(prefix);
  if (!trimmed) return [];
  return trimmed.split("/");
}

/** Build the prefix for the n-th breadcrumb segment (inclusive). */
export function prefixAtDepth(segments: string[], depth: number): string {
  if (depth < 0) return "";
  return segments.slice(0, depth + 1).join("/") + "/";
}

/**
 * Display name for either kind of entry, relative to the current prefix the
 * user is viewing. For folders we strip the parent and the trailing slash so
 * they read like file-manager folder labels.
 */
export function entryDisplayName(entry: S3Entry, currentPrefix: string): string {
  const parent = normalizePrefix(currentPrefix);
  if (entry.type === "prefix") {
    const rel = entry.prefix.startsWith(parent)
      ? entry.prefix.slice(parent.length)
      : entry.prefix;
    return trimTrailingSlash(rel);
  }
  return entry.key.startsWith(parent)
    ? entry.key.slice(parent.length)
    : entry.key;
}

/** Stable identity for selection sets — folder prefixes always end in /. */
export function entryId(entry: S3Entry): string {
  return entry.type === "prefix" ? entry.prefix : entry.key;
}
