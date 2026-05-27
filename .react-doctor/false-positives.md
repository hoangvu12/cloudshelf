# React Doctor — known false positives

Suppress these patterns when triaging. Each entry names the rule, the
file/shape it matches, and why the diagnostic doesn't apply.

## deslop/unused-file (entire codebase)

The scanner can't follow either of this app's entry points:

- **Bun server** — `server/index.ts` is launched by `bun --watch server/index.ts`
  (dev) and `bun server/index.ts` (prod) via `package.json#scripts`. That chain
  re-exports every server route, middleware, and lib indirectly.
- **Vite + TanStack Router** — `index.html` references `src/main.tsx`, which
  registers a generated `routeTree.gen.ts` that imports every `src/routes/*`.
  Routes in turn pull in every component, store, and `@/lib/*` helper.

Net effect: nearly every file under `server/` and `src/` lights up as
"unreachable". Spot-checks (`server/index.ts`, `object-browser.tsx`,
`ui/button.tsx`, `stores/uploads.ts`, `lib/api/objects.ts`) confirm each is
actively imported. Treat every `deslop/unused-file` finding in this repo as a
false positive unless you've manually confirmed nothing imports the file.

## deslop/unused-dev-dependency — `react-doctor`

Used by `package.json#scripts.doctor` (`"doctor": "npx react-doctor@latest"`).
The scanner doesn't look at script values.

## react-doctor/query-mutation-missing-invalidation — `useTestConnection`

`src/lib/api/connections.ts:42` — `POST /connections/test` is a read-only
connectivity probe (no S3 state changes server-side). No cache to invalidate.

## react-doctor/exhaustive-deps — uploads store memo

`src/stores/uploads.ts:659` — `useMemo` deliberately depends on a `signature`
string assembled inside a `useUploadsStore` selector. The memo body reads
`useUploadsStore.getState()` directly so signature is the change-detector. The
`eslint-disable-next-line` comment already documents the intent.

## react-doctor/no-prop-callback-in-effect — virtualizer pagination

`src/components/object-list.tsx` and `src/components/object-grid.tsx` —
`onLoadMore()` is called inside a `useEffect` keyed on the virtualizer's
`getVirtualItems()` output. This is the documented TanStack Virtual +
React Query pattern for windowed pagination; the virtualizer doesn't expose a
"reached end" event that would let us trigger from a handler.

## react-doctor/no-cascading-set-state — global keydown router

`src/components/object-browser.tsx` — the window-level `keydown` handler in
`useEffect` dispatches different `setState` calls per key. The rule counts
them as a cascade, but only one branch fires per keystroke; setStates aren't
sequenced within a single tick.

## react-doctor/no-event-handler — upload completion subscription

`src/components/object-browser.tsx` — the effect that subscribes to
`onUploadCompleted` is a long-lived pub/sub subscription, not a one-shot
side-effect-as-event. Cleanup unsubscribes on unmount; the effect dependencies
are correct.

## react-doctor/no-array-index-as-key — `ui/slider.tsx`

`src/components/ui/slider.tsx:55` — shadcn pattern for multi-thumb sliders.
Thumbs are positional (thumb 0, thumb 1, …); the value array can contain
duplicates, so an explicit key derived from data would alias. Index is the
correct identity here.

## react-doctor/no-giant-component — `ObjectBrowser`

`src/components/object-browser.tsx`. Broken up across two passes:

- **Pass 1 (handoff)** — 1107-line component, extraction deferred.
- **Pass 2** — extracted seven hooks (`use-object-browser-{actions, data,
  downloads, keyboard, mutations, selection, uploads}.ts`), a sibling
  component file (`object-browser-dialogs.tsx`) holding the dialog stack,
  header, and status bar, and consolidated derived data. ObjectBrowser is
  now composition + render. Function body is 326 lines (mostly hook
  invocations + JSX prop wiring) and the rule still flags it; pushing
  further by extracting a single mega-shell adds more `unused-file` FPs
  than it removes warnings, so this is the stopping point.

## react-doctor/prefer-tag-over-role — clickable cards with nested buttons

`src/components/bucket-grid.tsx`, `src/components/bucket-list.tsx`,
`src/components/object-grid.tsx`, `src/components/object-row.tsx` — each is a
clickable row/card that also contains its own inline buttons (pin toggle,
context menu, checkbox). Promoting the outer element to `<button>` would nest
interactive controls, which is invalid HTML. Keep the `role="button"` +
`tabIndex` + `onKeyDown` pattern; the proper resolution is a stretched-link
restructure tracked separately.

## react-doctor/js-tosorted-immutable — client tsconfig on ES2022

`src/components/bucket-list.tsx`, `src/components/bucket-grid.tsx` — the
app tsconfig (`tsconfig.app.json`) targets ES2022 / lib ES2022, so
`Array.prototype.toSorted` isn't in the type lib. Bumping to ES2023 is a
project-wide config change tracked separately; `[...arr].sort()` is the
equivalent until then. The server file's `toSorted` is fine because
`tsconfig.server.json` already targets ES2023.

## react-doctor/no-event-handler — canvas / virtualizer / pub-sub effects

- `src/components/share-dialog.tsx` (`QrPanel`) — canvas rendering is an
  imperative side-effect that must run in `useEffect`; no event-handler
  alternative.
- `src/components/object-list.tsx`, `src/components/object-grid.tsx` —
  `useVirtualizer({ getItemKey })` is a config callback the rule misreads as
  an effect-as-event-handler; key computation is pure.
- `src/components/object-browser.tsx` — `normalizePrefix(prefix)` derivation
  flagged adjacent to the upload-completion subscription. The subscription
  itself is a legitimate pub/sub `useEffect`.

## react-doctor/no-fetch-in-effect — `TextPreview`

`src/components/file-preview-panel.tsx` (`TextPreview`) — Range-GETs a
presigned URL to render code/text previews. The component is keyed by `url`
so each preview gets a fresh fetch; lifting this into React Query would
require querying with the volatile presigned URL as part of the key, which
churns the cache faster than it helps.

## react-doctor/no-cascading-set-state — global keydown router

`src/components/object-browser.tsx` — window keydown handler dispatches one
of several `setState` calls per key. Only one fires per keystroke; the rule
counts conditional branches as a cascade.

## react-doctor/no-adjust-state-on-prop-change — shiki tokens

`src/components/connection-snippets.tsx` — `HighlightedBlockInner` is keyed
by `${lang}:${code}` so it remounts on change. The effect that fetches new
tokens still has `code`/`lang` in its deps which trips the rule; tokens fall
back to plain text while the worker tokenizes, which is the intended UX.

## react-doctor/prefer-use-effect-event — `useShortcutsHelp`

`src/lib/shortcuts.tsx` — window keydown handler reads no captured state,
so the recommendation doesn't apply.
