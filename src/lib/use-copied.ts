import * as React from "react";

/**
 * Transient "just copied" flag for inline button feedback. `flash()` flips
 * `copied` to true and schedules a reset after `durationMs`. Repeated flashes
 * cancel the prior timer so the indicator stays up for the full duration after
 * the most recent click, not a leftover stale one.
 */
export function useCopied(durationMs = 1500) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  const flash = React.useCallback(() => {
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  React.useEffect(() => {
    const ref = timerRef;
    return () => {
      if (ref.current !== null) window.clearTimeout(ref.current);
    };
  }, []);

  return [copied, flash] as const;
}
