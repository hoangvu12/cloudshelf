/**
 * Public façade for the file-preview syntax highlighter.
 *
 * The Shiki work runs in a Web Worker (see highlighter.worker.ts) so that
 * tokenizing a 500KB log file doesn't stall scrolling or the prev/next keys
 * in the preview panel. This module is the thin client: it owns the worker
 * handle (singleton, spawned on first highlight) and correlates postMessage
 * requests with the promises the caller is awaiting.
 *
 * Unknown languages fall back to plain-text rendering in the panel (no
 * tokenization), so we never crash on a weird extension.
 */

import type { ThemedToken } from "shiki/core";
import type { HighlightResponse, ShikiLang } from "./highlighter.worker";

export type { ShikiLang, ThemedToken };

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

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (tokens: ThemedToken[][]) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(
    new URL("./highlighter.worker.ts", import.meta.url),
    { type: "module" }
  );
  w.addEventListener("message", (ev: MessageEvent<HighlightResponse>) => {
    const entry = pending.get(ev.data.id);
    if (!entry) return;
    pending.delete(ev.data.id);
    if ("error" in ev.data) entry.reject(new Error(ev.data.error));
    else entry.resolve(ev.data.tokens);
  });
  w.addEventListener("error", (ev) => {
    // If the worker dies, fail anything in flight so callers fall back to
    // plain text. The next highlight call will spawn a fresh worker.
    const err = new Error(ev.message || "highlighter worker crashed");
    for (const [, entry] of pending) entry.reject(err);
    pending.clear();
    worker = null;
  });
  worker = w;
  return w;
}

/**
 * Tokenize `code` as `lang` and resolve with Shiki's 2D token array (lines ×
 * tokens, each token has content + color + fontStyle). The panel renders this
 * itself in a virtualized list, so only the lines visible in the viewport
 * become DOM. Long lines come back as a single unstyled token — see the
 * `tokenizeMaxLineLength` guard in the worker.
 */
export function highlightToTokens(
  code: string,
  lang: ShikiLang
): Promise<ThemedToken[][]> {
  const id = nextId++;
  const w = getWorker();
  return new Promise<ThemedToken[][]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, code, lang });
  });
}
