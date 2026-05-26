/**
 * Small formatters shared by list views (buckets, objects, uploads).
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1) return "0 B";
  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, i);
  const fixed = value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${fixed} ${BYTE_UNITS[i]}`;
}

export function formatCount(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export function formatShortDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FORMATTER.format(d);
}

const RECENT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

/**
 * Mimics `ls -l`: dates within the last ~6 months show as "Mar 22 14:05",
 * older dates fall back to "Jan 12 2023". Reads natural at a glance in a
 * dense file listing.
 */
export function formatFileTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const isRecent = Date.now() - d.getTime() < SIX_MONTHS_MS;
  return isRecent
    ? RECENT_DATE_FORMATTER.format(d).replace(",", "")
    : DATE_FORMATTER.format(d).replace(",", "");
}
