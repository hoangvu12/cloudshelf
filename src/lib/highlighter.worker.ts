/**
 * Web Worker that owns the Shiki highlighter.
 *
 * Why a worker: Shiki's regex tokenization is synchronous and can stall the
 * main thread for hundreds of ms on a 500KB source/log file. Doing it here
 * keeps scrolling, key navigation, and prev/next in the preview panel
 * responsive while the file is being highlighted.
 *
 * Lifecycle: one worker for the app, spawned lazily by highlighter.ts. The
 * highlighter and loaded-grammar set live for the worker's lifetime, so
 * subsequent highlights of the same language are immediate.
 *
 * Protocol: main posts { id, code, lang }; worker replies with the same id
 * plus { html } on success or { error } on failure. The id correlates
 * concurrent requests when the user clicks through files faster than they
 * can be highlighted — the panel discards stale results, but the worker
 * still replies per-request.
 */
/// <reference lib="WebWorker" />

import type { HighlighterCore, ThemedToken } from "shiki/core";

declare const self: DedicatedWorkerGlobalScope;

export type ShikiLang =
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

const THEME = "catppuccin-mocha";

// Each loader is a thunk so Vite gets one chunk per language and the import
// only runs on first use. Don't inline — `import()` with a dynamic arg would
// defeat code splitting.
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

export type HighlightRequest = { id: number; code: string; lang: ShikiLang };
export type HighlightResponse =
  | { id: number; tokens: ThemedToken[][] }
  | { id: number; error: string };

self.addEventListener("message", async (ev: MessageEvent<HighlightRequest>) => {
  const { id, code, lang } = ev.data;
  try {
    const hl = await ensureLang(lang);
    // We return tokens (not HTML) so the panel can virtualize line rendering
    // — only the ~30 lines in view are ever mounted, instead of dumping a
    // multi-MB HTML string into the DOM. `tokenizeMaxLineLength: 5000` is the
    // Monaco-style long-line guard: lines longer than this come back as a
    // single unstyled token (Shiki skips tokenizing them), so a 3MB minified
    // JSON one-liner doesn't pin the worker on a single line.
    const tokens = hl.codeToTokensBase(code, {
      lang,
      theme: THEME,
      tokenizeMaxLineLength: 5000,
    });
    self.postMessage({ id, tokens } satisfies HighlightResponse);
  } catch (e) {
    const error = e instanceof Error ? e.message : "highlight failed";
    self.postMessage({ id, error } satisfies HighlightResponse);
  }
});
