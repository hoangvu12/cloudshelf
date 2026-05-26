/**
 * Shiki-based syntax highlighter, tuned for the file preview panel.
 *
 * Design goals:
 *   - Pay nothing if the user never opens a code file. The core, the JS regex
 *     engine, the theme, and every grammar are dynamic imports — Vite splits
 *     each into its own chunk, downloaded lazily on first use of that language.
 *   - One highlighter instance for the whole app, kept alive across panel
 *     opens. Grammars are loaded incrementally onto it via `loadLanguage`.
 *   - No WASM. The JS regex engine handles every language we ship and saves
 *     ~200 KB on the wire.
 *
 * The API the panel uses is just `highlightToHtml(code, lang)`. Unknown langs
 * fall back to plain text rendering (no tokenization), so we never crash on a
 * weird extension.
 */

import type { HighlighterCore } from "shiki/core";

/** Themes the panel will ever ask for. Keep at one so we don't bloat. */
const THEME = "catppuccin-mocha";

/**
 * Extension → Shiki language ID. Lowercase the input before lookup. Keep this
 * narrow on purpose — every entry here is one more grammar chunk a user might
 * pull. Add only what we actually preview.
 */
const EXT_TO_LANG: Record<string, ShikiLang> = {
  // Web / TS family
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  html: "html",
  css: "css",
  scss: "scss",

  // Markup / config
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  ini: "ini",

  // Backend langs
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  rb: "ruby",
  php: "php",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",

  // Shells / infra
  sh: "shellscript",
  bash: "bash",
  zsh: "bash",
  env: "bash",
  dockerfile: "docker",
};

/**
 * Languages we actually call into Shiki for. Listing them as a string-literal
 * union keeps the dynamic-import map honest at compile time — adding a new
 * entry to EXT_TO_LANG without adding it here is a type error.
 */
type ShikiLang =
  | "javascript"
  | "jsx"
  | "typescript"
  | "tsx"
  | "json"
  | "html"
  | "css"
  | "scss"
  | "markdown"
  | "yaml"
  | "toml"
  | "xml"
  | "ini"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp"
  | "ruby"
  | "php"
  | "sql"
  | "graphql"
  | "shellscript"
  | "bash"
  | "docker";

// Each loader is a thunk so Vite gets one chunk per language and the import
// only runs on first use. Don't inline — `import()` inside the switch in
// `ensureLang` would defeat code splitting because the arg would be dynamic.
const LANG_LOADERS: Record<ShikiLang, () => Promise<unknown>> = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
};

/**
 * Map a filename to a Shiki language ID, or `null` if we should render as
 * plain text. Looks at extension first, then a couple of well-known
 * extensionless names.
 */
export function shikiLangFor(name: string): ShikiLang | null {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "docker";
  if (lower === "makefile") return null; // No `makefile` grammar shipped.
  const dot = lower.lastIndexOf(".");
  if (dot === -1 || dot === lower.length - 1) return null;
  const ext = lower.slice(dot + 1);
  return EXT_TO_LANG[ext] ?? null;
}

// Module-level singletons. The promise dedupes concurrent first calls (e.g.
// React StrictMode double-invoke in dev) so we don't build two highlighters.
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<ShikiLang>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, theme] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
          import("shiki/themes/catppuccin-mocha.mjs"),
        ]);
      return createHighlighterCore({
        themes: [theme.default],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

async function ensureLang(lang: ShikiLang): Promise<HighlighterCore> {
  const hl = await getHighlighter();
  if (!loadedLangs.has(lang)) {
    const mod = await LANG_LOADERS[lang]();
    await hl.loadLanguage((mod as { default: unknown }).default as never);
    loadedLangs.add(lang);
  }
  return hl;
}

/**
 * Tokenize `code` as `lang` and return Shiki's `<pre><code>...</code></pre>`
 * HTML, themed with Catppuccin Mocha. Caller should drop it into the DOM with
 * `dangerouslySetInnerHTML` — Shiki escapes the input itself, so the HTML it
 * returns is safe regardless of file contents.
 */
export async function highlightToHtml(
  code: string,
  lang: ShikiLang
): Promise<string> {
  const hl = await ensureLang(lang);
  return hl.codeToHtml(code, {
    lang,
    theme: THEME,
  });
}
