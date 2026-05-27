/**
 * S3 bucket-name validation. Rules transcribed from AWS docs:
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
 *
 * S3-compatible services are usually a subset of these (MinIO, R2, B2 all
 * accept what AWS accepts), so erring on AWS's strict side gives the best
 * cross-target portability. Returns `null` if the name is acceptable, or a
 * short user-facing message describing what's wrong.
 *
 * `warn()` returns a soft advisory (currently: dots in names) that the UI
 * shows but doesn't block on — dots are technically legal but disable
 * virtual-hosted–style HTTPS, which is a footgun rather than an error.
 */

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const ALLOWED_CHARS = /^[a-z0-9.\-]+$/;
const STARTS_END_ALNUM = /^[a-z0-9].*[a-z0-9]$/;

/** Reserved prefixes AWS rejects outright. */
const BAD_PREFIXES = ["xn--", "sthree-", "amzn-s3-demo-"];
/** Reserved suffixes AWS rejects outright. */
const BAD_SUFFIXES = ["-s3alias", "--ol-s3", ".mrap", "--x-s3"];

export function validateBucketName(name: string): string | null {
  if (name.length < 3 || name.length > 63) {
    return "Must be 3–63 characters.";
  }
  if (!ALLOWED_CHARS.test(name)) {
    return "Use lowercase letters, digits, hyphens, and dots only.";
  }
  if (!STARTS_END_ALNUM.test(name)) {
    return "Must start and end with a letter or digit.";
  }
  if (name.includes("..")) {
    return "Can't contain consecutive dots.";
  }
  if (name.includes(".-") || name.includes("-.")) {
    return "Dots can't be adjacent to hyphens.";
  }
  if (IPV4.test(name)) {
    return "Can't look like an IP address.";
  }
  for (const p of BAD_PREFIXES) {
    if (name.startsWith(p)) return `Can't start with "${p}".`;
  }
  for (const s of BAD_SUFFIXES) {
    if (name.endsWith(s)) return `Can't end with "${s}".`;
  }
  return null;
}

export function warnBucketName(name: string): string | null {
  if (name.includes(".")) {
    return "Dots disable HTTPS for virtual-hosted-style access — prefer hyphens.";
  }
  return null;
}
