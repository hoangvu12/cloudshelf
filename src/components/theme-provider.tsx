import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

/**
 * The app is locked to dark — the Catppuccin Mocha palette is core to the
 * visual identity, and the buckets browser uses hardcoded ctp-* classes that
 * don't respond to a light toggle. Light tokens are left in styles.css in
 * case we ever want to revive a light mode, but they're not reachable here.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="dark"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
