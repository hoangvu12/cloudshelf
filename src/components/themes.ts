/**
 * Tokens are themeable via a three-tier architecture (see styles.css). Each
 * theme defines its own primitive palette under a `[data-theme="X"]` block;
 * semantic aliases and Tailwind utilities never change.
 *
 * Adding a theme:
 *   1. Add a `[data-theme="name"]` primitive block in styles.css
 *   2. Add the name to THEMES below
 *   3. Surface it in the settings appearance picker
 *
 * The `dark` class is hardcoded on <html> (see index.html) so shadcn's
 * `dark:` variant keeps working — every theme we ship is dark-aesthetic.
 */
export const THEMES = [
  "mocha",
  "macchiato",
  "tokyo-night",
  "nord",
  "rose-pine",
  "rose-pine-moon",
  "lilypichu",
  "vencord",
] as const;
export type ThemeName = (typeof THEMES)[number];
