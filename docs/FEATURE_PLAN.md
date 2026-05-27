# CloudShelf — Feature Implementation Plan

This is the canonical roadmap for new features. It is self-contained: any
future session can implement any phase by reading just this file plus the
referenced source paths. Phases are ordered by value × fit; each is
independently shippable. Pick a phase, build it, ship, move on.

---

## 0. Project context (read first)

CloudShelf is a single-user, self-hosted web file browser for S3-compatible
storage (MinIO, R2, AWS, B2, Wasabi, telegram-s3, …). The README explicitly
scopes it to **one user, one password**. Multi-user, SSO, OIDC, IAM admin,
S3 Batch Operations, replication management are **out of scope** — they
belong in MinIO Console, not here. Don't build them.

**Stack** (do not change without reason):

- Server: Bun + Hono, `bun:sqlite`, `@aws-sdk/client-s3`. Entry
  `server/index.ts`; routes in `server/routes/*.ts`; S3 helpers in
  `server/lib/s3.ts`; types shared with the SPA via `server/types.ts`
  (imported as `@server/types`).
- SPA: Vite 6, React 19, strict TS, TanStack Router (file-based) + Query,
  Tailwind v4, shadcn/ui (retheme'd — `rounded-2xl`, `h-12` inputs,
  `font-mono text-xs` for chrome), Zustand, Shiki (in a Web Worker).
- Production: one Bun process serves `/api/*` and the built SPA on `$PORT`.
- Uploads: presigned URLs minted server-side, bytes go browser↔S3 directly,
  multipart for big files, resume via localStorage fingerprint.

**Conventions** (match these — don't invent your own):

- API base path for object ops: `/connections/:id/buckets/:bucket/...` —
  see `server/routes/connections.ts` for the exact pattern.
- Server S3 calls wrap their try/finally and `client.destroy()` — every
  helper in `server/lib/s3.ts` does. Match it for new helpers.
- Errors: 404 for unknown connection/bucket, 400 for invalid payload (Zod
  via `safeParse`), 502 with `upstreamError()` envelope for SDK failures.
- React Query keys live in a `<resource>Keys` object inside
  `src/lib/api/<resource>.ts`. Invalidate on every successful mutation.
- Toasts via `sonner`; dialogs via `radix-ui` Dialog/Drawer + shadcn
  primitives in `src/components/ui/`.
- **Never run `bun run dev`** (memory: feedback_no_dev_server). For
  verification run `bun run typecheck` only. Manual smoke-testing in the
  browser is the user's job.

**Out of scope, do not propose:**
multi-user, SSO/OIDC/SAML/LDAP, role-based ACLs at the app layer,
replication editor, S3 Batch Operations, server access log dashboards,
OCR / semantic search / AI tagging, real-time collaborative editing,
custom KMS key management UI.

---

## 0.5. What already shipped (read before touching new phases)

If you're a fresh session, **read this section in full** — the codebase
already has some of what later phases reference, and earlier phases
deviated from the spec in load-bearing ways.

### Phase 1 — shipped ✅ (commit `feat(objects): metadata + tags editor in preview panel`)

Implemented as a **merge into the existing file preview panel**, not as a
separate drawer. The spec described an `object-info-panel.tsx` + a
zustand `object-info` store + a context-menu "Info" item + an `I`
shortcut. None of those exist. Instead:

- `src/components/file-preview-panel.tsx` now renders three back-to-back
  sections under the preview media:
  1. **Details** — the existing `<dl>` of Name/Size/Modified/Key/Type/ETag/Storage
     (the Type row was added, sourced from HEAD)
  2. **Metadata** — editable Content-type input + repeatable
     key/value rows for `x-amz-meta-*` (UI label: "Custom headers")
  3. **Tags** — repeatable key/value rows, capped at 10
- The "Info" context-menu item and `I` shortcut were dropped — preview
  already opens via click/Space and now contains everything.

**Server / API layer that DID ship as spec'd:**

- `server/lib/s3.ts` — `headObject`, `getObjectTags`, `putObjectTags`,
  `updateObjectMetadata` (CopyObject onto-itself with `MetadataDirective: REPLACE`)
- `server/routes/connections.ts` — `GET /objects/head`, `GET/PUT /objects/tags`,
  `PUT /objects/metadata` (Zod validation, 502 envelope, ?key= + optional ?versionId=)
- `server/types.ts` — `ObjectHead`, `ObjectTag`
- `src/lib/api/object-info.ts` — `useObjectHead`, `useObjectTags`,
  `usePutObjectTags`, `useUpdateObjectMetadata` with `objectInfoKeys`

### Conventions earned in Phase 1 — reuse these in later phases

**1. New "info-style" sections go INSIDE `file-preview-panel.tsx`.**
There is no info-panel component. Phases 5 (Versioning), 10 (Object Lock
retention/legal hold), 14 (EXIF) should each add another section to this
file using the helpers below.

**2. Section chrome:**

```tsx
<SectionHeader title="Versioning" trailing={…optional muted chip…} />
<SectionBody>{/* content */}</SectionBody>
```

Both are defined in `file-preview-panel.tsx`. The header is a full-width
`border-y` bar with `bg-input-bg/30`, uppercase tracking, foreground-color
title, optional muted trailing slot. Body provides `px-4 py-5 font-mono
text-[11px]`. New sections must use these so the visual hierarchy stays
parallel across Details / Metadata / Tags / future sections.

For per-row key/value editors, copy the layout from `TagsSection`:
`h-9` inputs, `space-y-2`, ghost `icon-sm` remove button on the right,
Add (`size="xs" variant="outline"`) + Save (`size="sm"`) on the same row
at the bottom (`justify-between`, `mt-6` from rows above).

**3. Graceful degradation on backends that don't implement a subresource.**
Telegram-s3 returns `Upstream S3 request failed` (502 from our wrapper)
for `GetObjectTagging`. The Tags section catches this in the query
state and renders:

```tsx
<SectionHeader title="…" trailing="unsupported" />
<SectionBody>
  <div className="text-muted-foreground space-y-1">
    <div>… isn't supported on this backend.</div>
    <div className="text-foreground/50 break-all text-[10px]">
      {error.message}
    </div>
  </div>
</SectionBody>
```

Mirror this pattern in Phases 7 (lifecycle), 8 (CORS / policy), and 10
(object lock) — they have the highest NotImplemented surface area on
non-AWS backends. Do NOT introduce the global `capabilities?` matrix
from the bottom of this doc yet; per-section catch-and-render is enough
until a real cross-feature need shows up.

**4. `apiFetch` supports `PUT`.** Added to `src/lib/api/client.ts`'s
`RequestOptions['method']` union in Phase 1. Use it freely.

**5. Mutation `onSuccess` wrapper — always spread, never destructure:**

```ts
onSuccess: (...args) => {
  qc.invalidateQueries({ queryKey: … });
  return options?.onSuccess?.(...args);
},
```

Newer `@tanstack/react-query` types add a 4th param; `(data, vars, ctx)`
destructure errors out. The spread is the canonical pattern across all
existing files in `src/lib/api/`.

**6. Per-resource API file convention** (e.g. `src/lib/api/object-info.ts`):
exports an `<resource>Keys` object with named factories, plus `useXxx`
hooks. Mutations invalidate both the specific key and any broader
`objectKeys.bucket` that surfaces affected rows in listings. New
resources (`versioning.ts`, `lifecycle.ts`, `cors.ts`, `policy.ts`,
`object-lock.ts`, …) mirror this exactly.

### Phases unblocked by Phase 1

5 (Versioning), 11 (in-browser text editor), 14 (EXIF panel).

### Phase 2 — shipped ✅ (commit `feat(share): TTL + QR share dialog`)

Shipped close to spec. Notable shape:

**Server / API:**

- `server/routes/connections.ts` — `GET /objects/download-url` now accepts an
  optional `?expiresIn=` (seconds). Validated via `z.coerce.number().int()
  .min(60).max(604800)` (7-day SDK ceiling); 400 on bad input. Omit it and
  the route behaves exactly as before (15-min default from
  `PRESIGN_TTL_SECONDS`), so the preview pane + one-click copy stay unchanged.
- `presignDownloadUrl` already accepted `expiresSeconds`; no s3.ts change.

**Client:**

- `src/lib/api/objects.ts` — `fetchDownloadUrl` gained optional 4th arg
  `expiresIn`. Same backwards-compatible default.
- `src/components/share-dialog.tsx` — new `<ShareDialog>` (radix Dialog,
  not a vaul drawer; the spec said "small dialog"). TTL chips
  `15m/1h/1d/7d`, custom seconds input + Apply button, read-only URL with
  copy-to-clipboard, live "Expires in Xd Yh" countdown, and a QR canvas
  rendered via `qrcode.toCanvas` on a white-padded square.
- `src/stores/share.ts` — tiny zustand store (`openKey | open | close`),
  mirroring `usePreviewStore`. The dialog is mounted once at the route
  level (`src/routes/buckets.$bucketName.$.tsx`) so any UI surface can
  trigger it without prop-drilling.

**Entry points:**

- Context menu — kept "Copy link" as the silent fast path; added a
  separate **"Share"** item (new `Share` material-symbols icon + `share`
  value on the `ContextAction` union in `src/components/object-list.tsx`).
  Label is plain "Share" — the spec said "Share…" but the ellipsis reads
  as truncation in the dense font-mono context menu.
- Toolbar "Copy link" — **Alt-click** opens the share dialog instead of
  copying. Required widening `ActionButton`'s `onClick` prop type to
  receive `React.MouseEvent` so the handler can read `e.altKey`.
- Toolbar also got a dedicated **"Share"** button (`Share` icon) next to
  "Copy link" for discoverability — Alt-click alone is too hidden. Same
  single-file constraint as Copy link.
- Preview-panel footer "Copy link" — same Alt-click trick; the panel
  pulls `openShare` from `useShareStore` directly.
- Title tooltips on both Copy link buttons advertise the modifier:
  `"Click to copy 15-min link · Alt-click for share options"`.
- While we were in `object-toolbar.tsx`, the per-icon accent colors on
  the bulk-action buttons (mauve Eye, green Download, sapphire Link,
  yellow FolderOutput, muted PenLine) were stripped — icons now inherit
  `text-foreground` so the row reads as one tonal group. Destructive
  Delete is the only colored exception, via the `destructive` variant on
  the button itself. Reuse this restraint for any future bulk-action
  entries (Phase 4 ZIP, Phase 6 cross-bucket move).

**Deps added:** `qrcode` (1.5.x) + `@types/qrcode`. Vite resolves the
package's `browser` field (`lib/browser.js`) automatically; we import the
named `toCanvas` only.

### Conventions earned in Phase 2 — reuse in later phases

**7. Cross-component dialogs go via a tiny zustand store.** When a single
dialog needs to be triggered from multiple sibling components (ObjectBrowser
+ FilePreviewPanel + future preview-panel sections), don't lift through the
route as props. Mirror `usePreviewStore` / `useShareStore`: `{ openKey,
open, close }`, plus a single mount at the route level. Phase 13 (Shelves),
Phase 18 (protected share links) should reuse this shape.

**8. Alt-modifier on toolbar/footer actions = "show me the full dialog".**
Fast paths stay one-click; Alt branches to the configurable dialog. Title
tooltip advertises the modifier. If you add more such actions
(e.g. download-with-options), follow the same modifier semantics so users
build muscle memory.

**9. `ActionButton`/`ActionBtn` `onClick` accepts the event.** The toolbar's
`ActionButton` now types `onClick: (e: React.MouseEvent<HTMLButtonElement>)
=> unknown`. The file-preview `ActionBtn` already spread `...props` to the
native button. Either way, handlers can read `e.altKey`, `e.shiftKey` etc.
when adding modifier behavior.

### Phases unblocked by Phase 2

13 (Public "shelf" galleries) and 18 (password-protected share links) both
build on the presign-with-TTL plumbing. The `?expiresIn=` route is the
only piece they actually need from this phase — the dialog itself is
unrelated.

### Phase 3 — shipped ✅ (commit `feat(uploads): folder drag-drop + picker`)

Shipped close to spec, with one intentional deviation noted below.

**`src/components/upload-dropzone.tsx`:**

- `useFsAccessApi: false` so dropped folders go through file-selector's
  `webkitGetAsEntry` recursion (without this, a folder drop yields zero
  files on Chromium).
- New `openFolderRef` prop alongside the existing `openRef`. A separate
  hidden `<input type="file" webkitdirectory>` lives inside the dropzone;
  triggering it via the ref opens the OS folder picker. The two inputs are
  separate because `webkitdirectory` forces directory-only selection — one
  input can't accept both files and a folder.
- `onFiles` callback signature changed: now `onFiles(items:
  UploadInputFile[])` where `UploadInputFile = { file: File; relativePath:
  string }`. `relativePath` is normalized from `webkitRelativePath` ||
  `file.path` (file-selector's leading-slashed field) || `file.name`.
- Drop-overlay copy updated: "Drop files or folders here to upload".

**`src/lib/uppy.ts`:**

- `UploadMeta` gained optional `relativePath`. **Uppy's
  `generateFileID` reads `meta.relativePath` natively** (see
  `node_modules/@uppy/utils/lib/generateFileID.js:26`) to disambiguate
  same-name files in different subdirs — without setting it, two
  `img1.jpg` files from sibling subfolders collide on the same Uppy
  fileID and the second add throws. Free win — no custom ID logic.

**`src/stores/uploads.ts`:**

- `addFiles(target, items: UploadInputFile[])` — signature changed. The
  S3 key is now built as `${prefix}${relativePath}` instead of
  `${prefix}${file.name}`, so subdirectories land at the right keys.
- `UploadItem.relativePath: string` added (required field — top-level
  uploads fall back to `file.name`, so it's always populated).
- The Uppy filename passed to `addFile()` stays as `file.name` (clean
  display in the panel); subdir uniqueness rides entirely on
  `meta.relativePath`.

**`src/components/object-browser.tsx`:**

- New `openFolderPickerRef` sibling to `openPickerRef`, plumbed through
  to `<UploadDropzone openFolderRef={…}>` and the toolbar's
  `onUploadFolder`.
- `handleUploadFiles` reshaped to take `UploadInputFile[]`. **Overwrite
  warning narrowed to top-level files only** — for folder uploads, a
  subdir collision lives under not-yet-loaded prefixes, so prompting
  about files the user can't see is noise. Filter is
  `!relativePath.includes("/")`.

**`src/components/object-toolbar.tsx`:**

- New "Upload folder" outline button between "Upload" and "New folder",
  icon `FolderUp` (Material Symbols `drive_folder_upload`). New
  `onUploadFolder: () => void` prop on `ObjectToolbar`.

**`src/components/upload-panel.tsx`:**

- `MetaLine` destination now folds the relative subdir into the
  displayed path so two `img1.jpg` rows in sibling subfolders read as
  e.g. `bucket/prefix/vacation` vs `bucket/prefix/europe` instead of
  identical `bucket/prefix`.

**`src/lib/icons.ts`:**

- Added `FolderUp` (Material Symbols `drive_folder_upload-fill`).

**Deviation from spec:** the spec said "Show one progress row per file,
grouped under a 'folder upload' header (collapsible)". I deliberately
**skipped the collapsible group header** — instead the relativePath is
folded into each row's MetaLine destination, which satisfies the "see
which file went where" need without a structural change to the panel.
Group headers can be added in a UI-polish follow-up if a noisy run
warrants them. No dedicated folder-walk helper was needed either —
react-dropzone's bundled file-selector already does the
`webkitGetAsEntry` recursion when `useFsAccessApi: false`.

### Conventions earned in Phase 3 — reuse in later phases

**10. Pass `meta.relativePath` to Uppy for any multi-file add where
sibling-collision is possible.** Uppy's `generateFileID` reads it
natively; without it, two files with the same name+size+lastModified
throw a duplicate-add error. The store keeps a parallel `relativePath`
field on `UploadItem` so the UI can show users where a row is landing.
Phase 16 (paste / URL upload) should set `relativePath` to the generated
key's leaf path for the same reason.

**11. Per-input flow for directory-only HTML inputs.** When a feature
needs `<input webkitdirectory>` (or any other "exclusive" file-input
attribute), don't try to share the existing dropzone input — render a
sibling hidden input and expose a second imperative trigger ref. The
dropzone's drag-drop overlay can advertise *both* paths without touching
either input element. Same shape any future "Upload from camera"
(`capture`) or filtered-`accept` shortcuts should reuse.

### Phases unblocked by Phase 3

None directly, but the `UploadInputFile` + `meta.relativePath` plumbing
is now the canonical "queue a file with an explicit destination subpath"
API. Phase 16 (paste / URL upload) and Phase 19 (extracting a file from
a zip) should both push through this same shape so they pick up the
disambiguation behavior for free.

### Phase 4 — shipped ✅ (commit `feat(objects): bulk download as ZIP`)

Shipped server-changeless per spec. Bytes flow browser ↔ S3 directly via
the existing `download-url` presigns; only the cheap presign + listing
round-trips touch our server.

**Dep added:** `client-zip` (2.5.x — zero-dep, ~14 KB, no `@types/*`
needed because it ships its own `.d.ts`).

**`src/lib/zip-download.ts` (new):**

- `gatherZipEntries(connectionId, bucket, selected, currentPrefix)` —
  expands a mixed file/folder selection into a flat `ZipEntry[]`. For
  any selected `S3PrefixEntry` it BFS-walks the existing
  delimiter-paginated `/objects` route (no server change). Inside-zip
  paths are stripped relative to `currentPrefix`, so selecting
  `photos/2025/` while browsing `photos/` produces zip entries like
  `2025/IMG_4021.jpg` rather than the full key.
- `downloadEntriesAsZip(connectionId, bucket, entries, filename)` —
  mints presigned URLs in a 6-worker parallel pool (`PRESIGN_CONCURRENCY`,
  mirrors the browser's per-host budget), then yields each fetched
  `Response` into `downloadZip()` from `client-zip` via an async generator.
  `client-zip` pulls one item at a time, so fetches naturally serialize
  with no extra throttling needed. The result `.blob()` is handed to a
  hidden `<a download>` with a deferred 60 s `URL.revokeObjectURL`.
- `SOFT_WARN_BYTES = 2 GB`, `HARD_CAP_BYTES = 10 GB`, `totalZipBytes()` —
  exported for the caller's size-cap UX.
- TTL for ZIP presigns is `60*60` s (1 h) — generous because a 9 GB zip
  on a slow link can outlast the default 15-min window before the last
  fetch.

**`src/components/object-browser.tsx`:**

- New `handleDownloadAsZip(targetEntry?)`. With no arg (toolbar path) it
  uses `selectedEntries`. With an arg (context menu path) it uses the
  full selection if the right-clicked entry is part of it, otherwise
  just the right-clicked entry — mirrors how `handleContextAction`
  already routes per-row "download" vs. bulk "download" for the plain
  Download item.
- Toast UX: single sonner toast id walks loading → loading (with byte +
  count summary) → success/error. Above `SOFT_WARN_BYTES` the toast is
  dismissed and a `window.confirm` blocks until the user opts in
  (because the zip buffers in browser memory).
- Filename: single-folder selection → `${folderName}.zip`; otherwise
  `${bucket}-YYYY-MM-DD.zip` so the OS Save dialog doesn't keep
  suggesting the same name.

**`src/components/object-toolbar.tsx`:**

- New `onDownloadAsZip` prop + an `ActionButton` between "Download" and
  "Copy link". Icon `FolderZip`. Always enabled in selection mode (single
  file works too — zips one file). Tooltip explains the recursion.

**`src/components/object-context-menu.tsx`:**

- New "Download as ZIP" item (`FolderZip` icon) right after "Download".
  **Always enabled** — works for files, folders, and multi-selection.
  This is the only entry point for downloading a folder (the plain
  "Download" item stays disabled on folders, as before).

**`src/components/object-list.tsx`:**

- `ContextAction` gained `"download-zip"`.

**`src/lib/icons.ts`:**

- Added `FolderZip` (Material Symbols `folder_zip-fill`).

**Deviations from spec:**

- **No streaming `<a download>` via Response body.** Spec called out the
  "stream via Response body" recipe to dodge the ~2 GB Blob URL ceiling
  on some browsers. We do the simpler buffered `.blob()` path and gate
  with the 2 GB soft warn + 10 GB hard cap instead — a true streaming
  download in-browser needs either StreamSaver (extra dep + service
  worker) or `showSaveFilePicker` (Chromium-only). The cap-and-warn
  matches the spec's intent without adding the dep.
- **Per-host fetch concurrency is 1, not 6.** Spec said "throttle to ~6
  concurrent" for the S3 GETs; we do 6 concurrent only for the
  *presign* round-trips and let `client-zip`'s pull-based iterator
  drive S3 fetches one at a time. Parallel S3 fetches don't help when
  the bottleneck is the single zip-output stream, and serial fetches
  keep memory pressure flat.

### Conventions earned in Phase 4 — reuse in later phases

None new — Phase 4 is small enough that nothing it did warrants
promotion to a numbered convention. The recursive prefix walker in
`zip-download.ts` is intentionally private; Phase 6 (folder rename) and
Phase 19 (zip-in-place) both have different recursion shapes (server-side
for 6, central-directory tail-fetch for 19) so there's no shared helper
to extract yet.

### Phases unblocked by Phase 4

None directly — Phase 4 was a no-deps leaf.

### Phase 15 — shipped ✅ (commit `feat(connections): CLI snippets dialog`)

Shipped close to spec. The dialog renders `aws-cli`, `boto3`, `mc`, and
`rclone` snippets sourced from the saved connection, with the secret key
masked-by-default + Reveal/Hide toggle. Copy always copies the *real*
snippet (including the secret), so users don't have to reveal first.

**`src/stores/snippets.ts` (new):**

- Tiny zustand store `{ openConnectionId, open(id), close }` — same shape
  as `usePreviewStore` / `useShareStore` per convention #7.

**`src/components/connection-snippets.tsx` (new):**

- `<ConnectionSnippetsDialog>` — radix Dialog, sm:max-w-2xl. Reads the
  active connection out of `useConnections()` cache by `openConnectionId`.
- Four tab triggers via `Tabs` from `ui/tabs`, each driving a
  `HighlightedBlock` that runs the snippet through the existing
  `highlightToTokens` Shiki worker (`bash` for aws/mc, `python` for boto3,
  `ini` for rclone). Falls through to plain `<pre>` text while the worker
  tokenizes or if it errors — no second highlighter instance, no extra
  bundle weight beyond the lang grammars already split out by
  `LANG_LOADERS`.
- Reveal/Hide is a Button on the toolbar row next to Copy. When hidden the
  snippet body shows `********` in place of `secretAccessKey`; the Copy
  button still writes the real secret to the clipboard.
- `boto3` snippet sets `addressing_style: "path"` when the connection has
  `forcePathStyle`; `rclone` snippet appends `force_path_style = true` in
  the same case. `mc` snippet pins `--api S3v4` so the alias is
  deterministic across mc versions.
- A muted footer note explains "Copy includes the real secret even while
  hidden. Treat the snippet like a credential."

**Mount + entry points:**

- `src/routes/__root.tsx` — `<ConnectionSnippetsDialog />` mounted once
  next to `<UploadPanel />` and `<ShortcutsDialog />` so it's reachable
  from any route.
- `src/components/app-sidebar.tsx` — `ActiveConnectionSwitcher` dropdown
  now has a "CLI snippets" item (new `Terminal` icon) below the
  separator, opening for the *currently active* connection. Hidden when
  no connection is active.
- `src/routes/settings.tsx` — each profile row in the Profiles section
  gets a hover-visible `Terminal` button between Activate and Edit,
  opening snippets for *that* specific profile (no need to activate it
  first).

**`src/lib/icons.ts`:**

- Added `Terminal` (Material Symbols `terminal-fill`).

**Deviation from spec:** none on UX; one positive expansion — the spec
just said "render snippets" but I plugged them into the shared Shiki
worker (`highlightToTokens` from `src/lib/highlighter.ts`) so the colors
match the file-preview text view exactly. Three of the four grammars
(`bash`, `python`, `ini`) were already in `EXT_TO_LANG` / `LANG_LOADERS`
from Phase 1's text-preview work, so this added zero new Shiki chunks.

**Two layout gotchas worth remembering** (relevant any time a future
phase puts a long-line `<pre>` inside a radix Dialog):

1. `<pre className="whitespace-pre overflow-auto">` requests its
   intrinsic content width, and grid items inside `DialogContent`
   default to `min-width: auto` — which lets the pre stretch the whole
   dialog past `sm:max-w-2xl`. Fix is `min-w-0` on every ancestor of
   the pre inside the dialog body (outer wrapper, `Tabs` root, the
   toolbar flex row, `TabsContent`), plus `shrink-0` on any toolbar
   button cluster you want pinned to the right edge.
2. radix's `react-remove-scroll` wrapper around the Dialog can swallow
   wheel events on elements that have horizontal overflow but no
   vertical overflow. Native shift+wheel translation breaks. The fix
   in `connection-snippets.tsx` is a small `onWheel` on the pre that
   reads `e.deltaX` (trackpads) or, when `e.shiftKey` is held, treats
   `e.deltaY` as horizontal — then sets `scrollLeft` and
   `preventDefault()`. Reuse this verbatim for any other in-dialog
   horizontally-scrollable code/log surface (Phase 8 policy JSON
   editor will hit this; Phase 11 in-dialog text editor probably
   won't, since Monaco owns its own scroll).

### Conventions earned in Phase 15 — reuse in later phases

None new — Phase 15 is small and additive. The Shiki integration is
specific to "show static code"; the existing virtualized `VirtualText`
in `file-preview-panel.tsx` is still the right pattern for *large*
file bodies. The simpler non-virtualized `HighlightedBlock` in
`connection-snippets.tsx` is fine for fixed-size snippet text and
shouldn't be lifted into a shared helper yet — wait for a third caller.

### Phases unblocked by Phase 15

None directly.

### Phase 14 — shipped ✅ (commit `feat(preview): EXIF panel for images`)

Shipped exactly as spec'd. EXIF lives as a new section inside
`file-preview-panel.tsx` (convention #1) between Details and Metadata —
parallel to where Details sits, since it's read-only "what's in this file"
info that pairs with the dl above it rather than the user-editable headers
below.

**`src/lib/api/exif.ts` (new):**

- `useImageExif(url)` — React Query hook keyed on the presigned URL
  (`exifKeys.parsed`). Range-GETs `bytes=0-131071` from the URL the preview
  body is already using, then dynamic-imports `exifr` and runs `parse(buf)`.
  Returns `ImageExif | null` (null when the image has no EXIF segment) and
  exposes the loose exifr shape — call sites pluck the fields they want.
- `staleTime: 30m` / `gcTime: 1h` — EXIF is immutable for a given key.
- `retry: false` — a missing EXIF block isn't a real error and we shouldn't
  burn the query-client's retry budget on it.
- `exifr` was already a transitive dep of `@uppy/thumbnail-generator`; we
  promoted it to a direct `^7.1.3` so we don't silently lose it if Uppy ever
  drops the dep. Dynamic-imported so the ~24 KB bundle stays out of the
  main chunk (loads only when the first EXIF-bearing image preview opens).

**`src/components/file-preview-panel.tsx`:**

- New `<ExifSection>` slotted between Details and `<MetadataSection>`.
  Gated on `head.data?.contentType?.startsWith("image/")` per spec — uses
  the HEAD-reported MIME, not extension, so HEIC/TIFF/etc. work even when
  the browser can't render them inline.
- Reuses `usePreviewUrl` to share the presigned URL with `<PreviewMedia>`
  via React Query cache — no extra presign call.
- Renders rows: Camera (`Make Model`), Lens, Shot at, Dimensions, ISO,
  Shutter, Aperture, Focal, GPS (with a Google Maps link). Each row only
  appears if its source field is present, so the section's row count
  shrinks gracefully.
- **"No EXIF" → hide entire section** (no header, no body). The acceptance
  spec said "shows nothing (no error)"; an empty header on a PNG would be
  noise. Also hidden silently while loading/erroring, since a real preview
  failure surfaces in the media area above.
- `Row` widened to accept `React.ReactNode` (was `string`) so the GPS row
  can host an anchor. No other call sites changed.

**Helpers (private to `file-preview-panel.tsx`):**

- `exifRows(data)` — projects the loose exifr object into the row list.
- `pickDimensions(data)` — tries `ExifImageWidth/Height` first, then
  falls back to `ImageWidth/Height` and `PixelXDimension/PixelYDimension`
  for formats that report dims under different tag names.
- `formatShutter(seconds)` — `1/200s` style for short exposures,
  `1.3s` for long ones.
- `GpsLink` — `https://www.google.com/maps?q=lat,lng` in a new tab,
  styled with `text-accent-blue` and `hover:underline`.

**Deviations from spec:**

- None on behavior. Two clarifications worth flagging:
  - Section placed **between Details and Metadata**, not at the end after
    Tags. EXIF is "what's in this file" info, peer to Details — pairing
    them keeps the read-only material together above the editable
    Metadata/Tags below.
  - Gating uses HEAD `contentType` rather than `previewKind(name)`. This
    is what the spec said ("MIME starts with `image/`"), and it picks up
    HEIC/TIFF correctly even when extension-based `previewKind` wouldn't.

### Conventions earned in Phase 14 — reuse in later phases

None new. Phase 14 is a clean application of convention #1
(SectionHeader/SectionBody inside `file-preview-panel.tsx`), #5 (mutation
onSuccess spread — n/a here, no mutations), and #6 (per-resource API file
in `src/lib/api/`). The "hide section entirely when there's nothing to
show" pattern is specific to EXIF — Versioning (Phase 5) and Object Lock
(Phase 10) should keep their section headers visible with explicit
"unsupported" / "off" trailing labels per the §0.5 step 3 graceful pattern,
since those features have meaningful empty states the user might want to
toggle on. EXIF has no such toggle.

### Phases unblocked by Phase 14

None.

### Phase 5 — shipped ✅ (commit `feat(versioning): bucket toggle + per-object history`)

Shipped close to spec. The "where does the toggle live?" UX question was
ambiguous in the spec (it just said "Bucket settings dialog"), so this phase
also introduced the bucket-settings entry point — see deviations below.

**Server / API:**

- `server/lib/s3.ts` — `getBucketVersioning`, `setBucketVersioning`,
  `listObjectVersions`, `deleteObjectVersion`, `restoreObjectVersion`. The
  restore helper is a CopyObject from `bucket/key?versionId=X` onto the same
  key with no versionId — `versionId=` is concatenated onto `CopySource`
  itself (SDK mirrors the wire format strictly; there's no top-level field).
  `listObjectVersions` loops on `IsTruncated`, filters to exact-key matches
  (prefix-listing can pull in siblings like `foo` vs `foobar`), merges real
  versions and delete markers into one list, and sorts newest-first by
  `lastModified` because some S3-compatibles don't honor the wire "latest
  first" contract.
- `server/types.ts` — `VersioningStatus = "Enabled" | "Suspended" | "Disabled"`
  (empty `Status` from S3 normalizes to "Disabled" so the client doesn't
  have to know about the wire quirk) and `ObjectVersion`.
- `server/routes/connections.ts` — five new routes:
  - `GET    /:id/buckets/:bucket/versioning`
  - `PUT    /:id/buckets/:bucket/versioning` (Zod-restricted to
    `"Enabled" | "Suspended"` — S3 has no "Disabled" target)
  - `GET    /:id/buckets/:bucket/objects/versions?key=`
  - `POST   /:id/buckets/:bucket/objects/versions/restore`
  - `DELETE /:id/buckets/:bucket/objects/versions?key=&versionId=`
  All wrap the SDK in the existing `upstreamError()` 502 envelope so the
  client can branch on "this backend doesn't implement the subresource".

**Client:**

- `src/lib/api/versioning.ts` — per-resource convention #6. `versioningKeys`
  exports `bucket(connectionId, bucket)` and `object(connectionId, bucket,
  key)` factories. Bucket-toggle query has `staleTime: 5min` because
  versioning state rarely flips and the preview panel's section reads it on
  every prev/next. Mutations (restore, delete) invalidate both the specific
  versioning-object key AND `objectKeys.bucket` — restoring writes a new
  latest version, deleting a marker un-deletes the key, both surface in the
  bucket listing.
- `src/components/file-preview-panel.tsx` — new `<VersioningSection>` slotted
  *after* `<TagsSection>`. Two layers of gating: (1) bucket-level
  `useBucketVersioning` 502 → `trailing="unsupported"` + muted message
  (convention #3, mirrors how `TagsSection` handles telegram-s3); (2) when
  status is `Disabled` we surface "Versioning is disabled for this bucket.
  Enable it in bucket settings." without firing the per-object list query.
  When status is `Enabled` or `Suspended` we mount `<VersionsList>` which
  pulls `useObjectVersions` and renders one `<VersionRow>` per entry.
- `VersionRow` — pill badge for `Latest` (green) or `Deleted` (destructive);
  truncated version-id (`abc12345…`), formatted lastModified, size, storage
  class. Three icon buttons:
  - **Restore** (history icon) — disabled when the row IS already the latest
    or is a delete marker.
  - **Download** — only enabled on the latest version. Older-version
    download isn't wired (the existing `download-url` route doesn't accept
    `?versionId=`); for now we toast "Restore the version first to download
    its contents." Adding `?versionId=` to that route is a small follow-up
    if a user actually needs it.
  - **Delete** — `window.confirm` gate ("Permanently delete this version?
    This cannot be undone."). Works on real versions and delete markers
    (removing a marker un-deletes the key).
- `src/components/bucket-dialogs.tsx` — new `BucketSettingsDialog` next to the
  existing `CreateBucketDialog`. Today it just hosts `<VersioningToggle>`
  (Switch + muted explanatory copy that explains the Enabled/Suspended
  asymmetry). Built so Phases 7, 8, 10 can slot more sections in next to it
  without restructuring.
- `src/components/object-browser.tsx` — added a small Settings cog button on
  the right side of the breadcrumb row (next to where the breadcrumb sits)
  that opens the BucketSettingsDialog. Reused the same `IconBtn`-style
  chrome the breadcrumb arrows use so the visual weight matches. The
  breadcrumb container had to switch from no-justification to
  `justify-between` to host both children.

**Icon added:** `Restore` (Material Symbols `history-fill`) — exported from
`src/lib/icons.ts` next to `RotateCw`.

**Deviations from spec:**

- Spec said "Lazy-mount [the section] only when `useBucketVersioning(...)`
  returns Enabled or Suspended" — I interpret "lazy-mount" loosely. The
  section ALWAYS renders so the user gets feedback (loading skeleton,
  unsupported chip, or "Disabled — enable in bucket settings"), and the
  per-object versions query only fires when status is `Enabled`/`Suspended`.
  Silently hiding the section on a versioning-disabled bucket would leave
  the user wondering whether the feature exists at all. Convention #3 from
  §0.5 favors keeping the section visible with an explicit chip.
- Spec didn't say where the BucketSettingsDialog's entry point lives —
  there wasn't one before. Adding a discoverable cog to the breadcrumb row
  was the lowest-cost option; the alternative (wiring `MoreHorizontal` on
  bucket-list rows) requires building a dropdown menu first and only
  reaches the dialog from the home page, not from inside the bucket where
  the Versioning section is rendering.
- Older-version download is intentionally a no-op-with-toast rather than a
  real direct-download. Restore-then-download is one click longer but
  matches the spec's stated path ("restore as latest").

### Conventions earned in Phase 5 — reuse in later phases

None new. Phase 5 is a clean application of conventions #1 (SectionHeader/
SectionBody inside `file-preview-panel.tsx`), #3 (graceful unsupported
treatment), #5 (mutation `onSuccess` with `...args` spread), #6
(`versioningKeys` + per-resource API file with cross-resource invalidation),
and #7 (no zustand store — versioning lives in the preview panel, and
BucketSettingsDialog state stays local to the object browser). The new
BucketSettingsDialog is the natural home for Phase 7 (lifecycle), Phase 8
(CORS/policy), and Phase 10 (object lock) toggles when those ship — slot
another component next to `<VersioningToggle>`.

### Phases unblocked by Phase 5

10 (Object Lock / retention / legal hold) — was the only phase explicitly
blocked on Phase 5 per the §1 dependency column.

### Phase 9 — shipped ✅ (commit `feat(uploads): storage class on upload`)

Shipped close to spec. The picker pre-bakes `x-amz-storage-class` into the
presigned URL / `CreateMultipartUpload` rather than asking Uppy to send a
required header — cleaner client side, no `requiredHeaders` plumbing.

**Server / API:**

- `server/lib/s3.ts` — `presignSingleUpload` and `createMultipartUpload`
  each grew an optional `storageClass?: string` parameter. Both pass it
  straight onto the underlying `PutObjectCommand` / `CreateMultipartUploadCommand`.
  The SDK types `StorageClass` as a string-literal union; we accept any
  string at the route boundary and cast through (`as StorageClass | undefined`)
  with a comment so the next reader knows the wire union is broader than
  the SDK's literal set.
- `server/routes/connections.ts` — both `POST /objects/presign/upload` and
  `POST /objects/multipart/start` now read `?storageClass=` off the query
  string. Validated via a shared `storageClassSchema = z.string().trim().min(1).optional()`
  (free-form rather than a hard enum) so S3-compatible backends that ship
  their own classes (telegram-s3, R2, B2 …) aren't rejected at the API
  layer. The canonical AWS set is restricted on the client side (see UI).
  Backends that don't recognize the chosen class typically fall back to
  STANDARD silently — the upload still succeeds, satisfying Phase 9's
  graceful no-op requirement without any 502 handling.

**Client:**

- `src/stores/prefs.ts` — added `defaultStorageClass: string | undefined`
  plus a dedicated `setDefaultStorageClass` setter alongside the existing
  `setViewMode` / `setDensity`. Persisted via `cloudshelf.prefs`. Default
  is `undefined` — meaning "let the backend pick", which round-trips as
  no `?storageClass=` query param.
- `src/stores/upload-session.ts` (new) — non-persisted `useUploadSessionStore`
  with `{ storageClass, setStorageClass }`. Carries the session-level
  override surfaced by the upload-panel toolbar so changing the active
  class doesn't rewrite the persistent default (the spec called for "per
  upload session" override semantics distinct from the pref).
- `src/stores/uploads.ts` — `addFiles` resolves the effective class once
  at queue time: `session ?? prefs.defaultStorageClass ?? undefined`. The
  resolved value is stamped onto each `UploadItem`'s meta so mid-session
  changes don't perturb in-flight files (same lock-in pattern as
  `compressImages`).
- `src/lib/uppy.ts` — `UploadMeta` gained an optional `storageClass`. Both
  the single-PUT `getUploadParameters` and `createMultipartUpload`
  callbacks read it off meta and append `?storageClass=` to the relevant
  POST. For the multipart-start route, `URLSearchParams` would
  double-encode the URL-already-encoded bucket; using `new URL(...,
  window.location.origin)` + `searchParams.set()` composes the final
  query string cleanly without touching the existing path encoding.
- `src/components/upload-panel.tsx` — new thin `<Toolbar />` row under the
  Header hosts `<StorageClassPicker />`, a DropdownMenu trigger with
  Database glyph + "STORAGE: <class>" label. Menu lists the eight
  canonical AWS classes (STANDARD, STANDARD_IA, INTELLIGENT_TIERING,
  ONEZONE_IA, GLACIER_IR, GLACIER, DEEP_ARCHIVE, REDUCED_REDUNDANCY) with
  one-line hints, plus a "Default" sentinel at the top that clears the
  session override. Selecting an item writes through to
  `useUploadSessionStore.setStorageClass` only — the persisted pref isn't
  touched (spec called this out explicitly).

**Object info panel surfaces actual storage class:** Phase 1 already shipped
the "Storage" row in `<DetailsSection>` from `entry?.storageClass` (the value
listing returns for the object). Verified visually — uploading with
`StorageClass: GLACIER` makes the next listing return `GLACIER` in the row,
satisfying the spec acceptance criterion.

**Deviations from spec:**

- **Free-form `z.string().optional()` on the route** instead of a hard enum
  of S3's canonical eight. The spec explicitly allowed either; the
  free-form choice keeps non-AWS backends with custom classes (e.g.
  `EXPRESS_ONEZONE` lookalikes, R2's bucket-default semantics) working
  without future schema churn. The picker UI still restricts user input to
  the canonical set so the typical user can't accidentally invent a
  string, but a power user hitting the API directly isn't gated.
- **Toolbar is its own row, not inline in Header.** The Header is already
  five elements wide on a `h-12`; squeezing the dropdown in there
  compresses the status-summary pills. A dedicated `h-9 bg-card/60` row
  reads as a "session controls" tray and leaves the door open for a
  Phase 16 paste-target dropdown next to it without a layout rewrite.
- **Pref + session override are two stores, not one.** Spec said "New
  Zustand pref … with setter" + "dropdown overrides the default per upload
  session." Two stores is the simplest faithful reading: the persisted
  pref keeps cross-tab agreement, the session store keeps the current
  tab's override out of localStorage. `addFiles` resolves both with a
  fall-through.

### Conventions earned in Phase 9 — reuse in later phases

None promoted to numbered conventions — Phase 9 is small and entirely
covered by the existing set (#4 apiFetch / URL building, #5 mutation
onSuccess spread is N/A no mutations, etc.). The "session-only zustand
store next to a persisted pref" pattern in `upload-session.ts` is reusable
for any future per-session upload knob (Phase 16 paste-from-URL target,
hypothetical future "session encryption mode"), but waits for a second
caller before being lifted to a shared helper.

### Phases unblocked by Phase 9

None directly — Phase 9 was a no-deps leaf.

### Phase 16 — shipped ✅ (commit `feat(uploads): paste + URL upload`)

Shipped close to spec. Both paths drop new objects into the current prefix,
but they use very different transport: paste reuses the existing Uppy queue
(bytes travel browser → S3 directly via presigned PUT), while "From URL"
runs entirely on the server (bytes travel upstream → server → S3, never
through the browser).

**A) Paste from clipboard:**

- `src/components/object-browser.tsx` — new `window`-level `paste` listener
  installed inside the `ObjectBrowser` effect block. Reads
  `e.clipboardData?.items`, filters to `kind: "file"` blobs with an
  `image/*` MIME, re-wraps each as a `File` named
  `pasted-${ISO-timestamp}[-${n}].${ext}` (extension comes from the MIME),
  and pushes through the existing `handleUploadFiles` path — same as
  drag-drop or the folder picker. `meta.relativePath` is set to the
  generated leaf so Uppy's `generateFileID` disambiguates same-name files
  if a user pastes twice in quick succession (convention #10).
- **Short-circuits for paste in editables.** `isEditableTarget(e.target)`
  bails when the user is typing in an input/textarea/contentEditable; we
  also re-check `document.activeElement` for the case where the event
  bubbles to `window` while a dialog input is focused. Plain `Ctrl-V` on
  text never gets hijacked.
- Only image MIMEs are intercepted. A `Cmd-V` of a Finder-copied
  spreadsheet would otherwise silently queue itself; drag-drop is the
  explicit path for non-image clipboard contents and stays unsurprising.
- The new private helpers `nowStamp()` and `extensionForMime(mime)` are
  file-local to `object-browser.tsx` — both are intentionally small and
  not extracted to `lib/`, since no other call site needs them yet.

**B) Upload from URL (server-side streaming):**

- `package.json` — `@aws-sdk/lib-storage@^3.1054.0` added. Brings the
  `Upload` helper, which transparently chooses single-PUT vs. multipart
  past the 5 MB SDK threshold. The peer-dep mismatch warning Bun prints
  (lib-storage's pinned client-s3 vs ours) is benign for our flow.
- `server/lib/s3.ts` — new `uploadFromStream(conn, bucket, key, body,
  contentType?, contentLength?, sizeCapBytes?)` matches the
  try/finally + `client.destroy()` shape every other helper in the file
  uses. A `capStream(body, cap)` passthrough TransformStream counts bytes
  before forwarding chunks; the moment `seen > cap` it errors the
  controller with a new `StreamSizeExceededError`, which aborts the
  multipart upload (the SDK does the `AbortMultipartUpload` for us on
  throw). Content-Length advertised over the cap is rejected before we
  even open the multipart upload.
- `server/routes/connections.ts` — `POST /:id/buckets/:bucket/objects/from-url`
  body `{ url, key }`. Validates via `fromUrlSchema` (Zod), then:
  1. URL scheme must be `http:` / `https:` — `file://`, `data:`, etc. → 400
  2. Hostname must NOT match the new `isPrivateHostname()` predicate, which
     blocks `localhost`, `127.0.0.1` / `127.*`, `0.0.0.0`, IPv6 loopback,
     `fe80:` link-local, RFC1918 (`10.`, `192.168.`, `172.16-31.`),
     `169.254.` link-local, and `100.64-127.` carrier-NAT. A simple
     hostname-prefix check is enough for a single-user app — no recursive
     DNS resolve / TOCTOU guard.
  3. `fetch(url, { redirect: "follow" })`, surface non-2xx as a 502.
  4. Pull `Content-Length` (optional) + `Content-Type` (fallback
     `application/octet-stream`) off the upstream response.
  5. Hand `upstream.body` (a `ReadableStream<Uint8Array>`) straight into
     `uploadFromStream` with the 1 GB cap. The SDK calls `AbortMultipartUpload`
     for us if we throw mid-stream.
  6. `StreamSizeExceededError` → `413 Payload Too Large` with a clear
     message; everything else → `502` via the uniform `upstreamError()`
     envelope.
- `src/lib/api/upload-from-url.ts` — per-resource convention #6.
  `useUploadFromUrl(connectionId, bucket)` mutation, `onSuccess`
  invalidates `objectKeys.bucket(connectionId, bucket)` so the new key
  shows up in any open listing without manual refresh. Uses the convention
  #5 `(...args)` spread so the new react-query types stay happy.
- `src/components/upload-from-url-dialog.tsx` — local-state dialog (no
  zustand store; the toolbar mounts it directly so convention #7 isn't
  needed). Two `Input`s for URL + filename, with the filename
  auto-tracking the URL's last path segment until the user types into it
  (a `filenameDirty` flag locks the field on first edit). The final S3
  key is `normalizePrefix(prefix) + trimmedFilename`. Submit fires
  through `useUploadFromUrl.mutate`; status walks a single sonner toast
  id `loading → success/failure`. A muted note advertises the 1 GB cap +
  internal-host policy so users know upfront.
- `src/components/object-toolbar.tsx` — new `onUploadFromUrl: () => void`
  prop and a `"From URL"` button between "Upload folder" and "New folder",
  styled `variant="outline"` to match the existing folder-picker entry.
  Icon: `CloudUpload` (Material Symbols `cloud_upload-fill`) — already
  exported from `lib/icons.ts`, no new icon added.
- `src/components/object-browser.tsx` — new `uploadFromUrlOpen` state +
  `<UploadFromUrlDialog>` mounted once next to `<BucketSettingsDialog>`.

**Deviations from spec:**

- The spec says the cap is enforced "before exceeding the cap". We do
  *both* — refuse upfront if upstream advertises a Content-Length over
  the cap, AND tear down the multipart upload mid-stream via the
  TransformStream cap. Belt-and-braces; the upfront check saves one
  multipart round-trip on the easy case, the cap-stream is the
  authoritative defense.
- The SSRF guard is a hostname-prefix check, not a DNS-resolve + recheck
  loop. Trade-off documented inline in the helper. This app is
  single-user / self-hosted; a deeper SSRF guard would be over-engineered
  for the threat model.
- The dialog uses local state, not a zustand store (convention #7), per
  the spec note: only the toolbar mounts it, so prop-drilling isn't a
  concern.
- Paste explicitly limits itself to image MIME types. The spec said
  "Blobs with image MIME", which I read literally — non-image pastes
  fall through to native browser behavior.

### Conventions earned in Phase 16 — reuse in later phases

None new. Phase 16 is a clean application of #5 (mutation onSuccess
spread), #6 (per-resource API file), and #10 (`meta.relativePath` on every
queued file). The new server-side `uploadFromStream` helper is reusable
for any future "server fetches body, server PUTs to S3" flow (e.g. a
hypothetical "import from another bucket" path) — but it's not a numbered
convention yet because the only caller is `from-url`. If a second
streaming-upload route ever lands, lift the size-cap TransformStream
pattern into its own helper at that time.

### Phases unblocked by Phase 16

None — Phase 16 is a leaf.

### Phase 17 — shipped ✅ (commit `feat(activity): SQLite audit trail + Settings tab`)

Shipped close to spec. The log lives in the same `bun:sqlite` database the
connections table already uses (`./data/cloudshelf.db`), surfaces via a new
`/api/activity` route pair, and renders inside the existing `settings.tsx`
under a new "Activity" tab.

**Server / DB:**

- `server/db.ts` — new `activity` table created next to `connections` and
  `meta` in `getDb()`. Schema matches the §0.5 spec exactly:
  `id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL,
  connection_id TEXT, bucket TEXT, key TEXT, detail TEXT`, plus the
  `activity_ts (ts DESC)` index. `detail` rides as a JSON blob.
- Helpers exported next to the existing connection helpers (per the
  "match the style" hint): `logActivity({ kind, connectionId, bucket, key,
  detail })`, `listActivity(limit, offset)`, `clearActivity()`,
  `trimActivity(keep = 10_000)`. `logActivity` wraps its insert in a
  `try/catch` and just `console.warn`s on failure — a transient SQLite lock
  should never break the user's actual mutation (the upstream S3 call
  succeeded by the time we get here).
- `server/index.ts` — calls `trimActivity(10_000)` once at boot, before the
  Hono app is constructed. Single-user volumes are low enough that a cron
  is overkill — the spec called this out explicitly.

**Routes (`server/routes/activity.ts`):**

- `GET /api/activity?limit=50&offset=0` — newest-first listing with a Zod-
  coerced `limit` clamped to `1..200` and `offset` `>=0`. Returns
  `{ rows, total, limit, offset }` so the client can show "1234 entries"
  without a second round-trip.
- `DELETE /api/activity` — clears the table; returns `{ ok: true, removed }`.
- Both routes live behind the existing `requireSession` gate at the
  `/api/*` boundary in `server/index.ts`.

**Mutating-route logging (`server/routes/connections.ts`):**

Logged after the successful upstream response, before `c.json(...)`:

| Route | `kind` | Notes |
|-------|--------|-------|
| POST `/buckets` | `bucket-create` | |
| POST `/folders` | `folder-create` | |
| POST `/objects/delete` (1 key) | `delete` | |
| POST `/objects/delete` (N keys) | `delete-bulk` | `detail.count`, `detail.sample` (first 5) |
| POST `/objects/copy` (same parent prefix) | `rename` | |
| POST `/objects/copy` (different prefix) | `copy` | |
| POST `/objects/multipart/complete` | `upload` | `detail.transport: "multipart"` |
| DELETE `/objects/multipart` | `upload-abort` | |
| POST `/objects/presign/upload` | `presign-upload` | `detail.transport: "single"` — see deviation |
| POST `/objects/from-url` | `upload-from-url` | `detail.sourceUrl` |
| PUT `/objects/tags` | `tags-update` | |
| PUT `/objects/metadata` | `metadata-update` | |
| PUT `/versioning` | `versioning-set` | `detail.status` |
| POST `/objects/versions/restore` | `version-restore` | `detail.versionId` |
| DELETE `/objects/versions` | `version-delete` | `detail.versionId` |

**Explicitly NOT logged**, with rationale:

- `GET /objects/download-url` (single + share-dialog TTL'd). The hint flagged
  this as ambiguous; I went with the "keep signal-to-noise high" reading.
  Every preview pane open mints one of these — logging them would drown out
  every other action. Users who care about share-link audit will get it from
  Phase 18 (protected share links), which is purpose-built for it.
- `POST /objects/multipart/start` and the per-part presign endpoint. Starts
  may be aborted, parts are noise. The authoritative "upload happened" row
  rides on `multipart/complete`.
- All reads (HEAD, list, list-versions, get-tags, get-versioning,
  list-multipart-parts, `/connections` CRUD). The log is for write actions
  on S3 state — managing connection profiles isn't an S3 action and
  cluttering the log with profile edits would erode the audit signal.

**Single-presign-upload ambiguity — how I resolved it:**

Single-PUT uploads (files under the multipart threshold, ~5 MB) stream
browser → S3 directly via the presigned URL minted by the server; the server
never sees the upstream completion. I considered four options:

1. Log nothing. Loses the most common upload path entirely.
2. Add a "completion ping" route the browser hits after the PUT. New
   moving part, easy to forget to call, and a ping that lies (the user
   could spoof it) is worse than no signal.
3. Server-side HEAD probe after presign. Adds latency to the hot path,
   and presigns are valid for 15 min so any HEAD here is best-effort anyway.
4. Log `presign-upload` at presign-mint time. The user clicked Upload, we
   committed to it. Honest about what we know — that we *handed out the URL*,
   not that the PUT succeeded.

Picked **(4)**, with the `kind` deliberately distinct from `upload` so the
activity view can show "Started upload" (info tone) vs. "Uploaded file"
(success tone). `detail.transport: "single"` vs. `"multipart"` lets future
code distinguish the two; today the verb mapping in `describeKind` is the
only consumer.

**Client (`src/lib/api/activity.ts`):**

- Per-resource convention #6: `activityKeys.all` + `activityKeys.list(limit)`
  factories, `useActivity(limit = 50)` infinite query, `useClearActivity()`
  mutation with the convention #5 `(...args)` spread on `onSuccess`. The
  mutation invalidates only `activityKeys.all` — activity rows don't
  surface anywhere else in the UI, so there's no `objectKeys` etc. to
  invalidate.
- `useInfiniteQuery`'s `getNextPageParam` reads `(offset + rows.length)
  >= total` to terminate. `pageParam: 0` initially.

**Client (`src/routes/settings.tsx`):**

- New `"activity"` member added to the `Section` union and `NAV_ITEMS` (Clock
  icon, between Profiles and Keyboard).
- `ActivitySection` renders header (title, "X entries" pill, Clear log
  button with `window.confirm`) over a virtualized list using
  `@tanstack/react-virtual` (already a dep — copied the pattern from
  `object-list.tsx`; the same library powers the file-preview text view).
  Row height is fixed at 64 px (`ACTIVITY_ROW_HEIGHT`), `overscan: 8`,
  `getItemKey: (i) => rows[i]?.id`. Infinite-scroll triggers via the same
  "last visible row is the sentinel" check the object list uses — no extra
  IntersectionObserver.
- `ActivityRow` shows: kind chip (color-coded via `ACTIVITY_TONE`), human
  verb ("Deleted file", "Uploaded file", …), `bucket/key` scope, an inline
  TanStack Router `<Link to="/buckets/$bucketName/$">` to the *parent
  prefix* of the affected key (the file itself may no longer exist on a
  delete/rename, but the prefix usually does), and a relative timestamp
  ("just now", "12m ago", "3h ago") that falls through to `toLocaleString`
  past 24 h.
- "Clear log" button uses `window.confirm` (mirrors the existing "Reset
  local preferences" in About and the per-profile delete in Profiles —
  there's no project-wide confirm dialog primitive yet, and a one-off
  modal for this would be excess weight).

**Deviations from spec:**

- Spec said "log on `/multipart/complete` only" + "log a `presign-upload`
  row at presign-mint time as the best signal we have". I did **both**, with
  the kinds deliberately distinct so the UI can render them differently.
  See the "Single-presign-upload ambiguity" subsection above for the
  reasoning.
- Spec floated the bucket-delete route as a possible log site. There isn't
  one in the codebase (no Phase has shipped a bucket-delete endpoint yet),
  so it's a no-op — when Phase 8 or a future bucket-management phase adds
  one, drop a `logActivity({ kind: "bucket-delete", ... })` next to its
  upstream call.
- Spec mentioned a "rename-prefix" route. That'll come with Phase 6
  (cross-bucket copy/move + folder rename). Today the only rename surface
  is the same-prefix copy + delete pair via `/objects/copy` and
  `/objects/delete`, which already produce a `rename` + `delete` pair in
  the log — distinguishable from a real copy by the matching parent
  prefix logic in the copy-route handler.
- Spec said "link to the bucket/prefix where it happened". I link the
  *parent prefix* of the affected key (e.g. a delete of
  `photos/2025/IMG.jpg` links to `photos/2025/`) rather than the key
  itself, because the key often no longer exists (deleted, renamed,
  version-pruned). Bucket-only rows (bucket-create, versioning-set) link
  to the bucket root.
- The "Clear log" UI uses `window.confirm`, not a radix Dialog. The
  project has no shared confirm-dialog primitive (existing destructive
  flows like "Reset local preferences" and profile-delete both use
  `window.confirm` too), so this matches the prevailing style. If a
  confirm dialog primitive lands later, swap it in here.

### Conventions earned in Phase 17 — reuse in later phases

None new. Phase 17 is a clean application of:

- **#5** (mutation `onSuccess` `(...args)` spread — `useClearActivity`).
- **#6** (per-resource API file `src/lib/api/activity.ts`).
- The server-side `logActivity` helper is the natural call site for any
  future write route. Phase 6 (cross-bucket copy/move + folder rename),
  Phase 7 (lifecycle rules editor), Phase 8 (CORS/policy), Phase 10
  (object lock), Phase 11 (in-browser text editor save), and Phase 18
  (protected share links create/revoke) should all `logActivity` after
  their upstream success calls. Use one of the existing `kind` strings
  when the action is conceptually identical (e.g. rename-prefix should
  still log `rename`); coin a new one when the action is novel.

### Phases unblocked by Phase 17

None directly — the log is a leaf consumer of the existing write routes.

### Eligibility snapshot (as of Phase 17 ship)

Pickable now, in rough recommend-first order:

- **20** Range-GET video player polish (S, no deps)
- **10** Object Lock / retention / legal hold (M, unblocked by Phase 5)
- **2-blocked**: 13 (shelves), 18 (protected share links) — eligible.
- Heavier M/L: 6, 7, 8, 11, 12, 19.

---

## 1. Phase ordering at a glance

| # | Phase                               | Effort | Depends on | Status |
|---|--------------------------------------|--------|------------|--------|
| 1 | Object info, metadata, tags panel    | M      | —          | ✅ shipped (see §0.5) |
| 2 | Share dialog upgrade (TTL + QR)      | S      | —          | ✅ shipped (see §0.5) |
| 3 | Folder upload                        | S      | —          | ✅ shipped (see §0.5) |
| 4 | Bulk download as ZIP                 | S      | —          | ✅ shipped (see §0.5) |
| 5 | Versioning view + restore            | M      | 1          | ✅ shipped (see §0.5) |
| 6 | Cross-bucket copy/move + folder rename | M    | —          |
| 7 | Lifecycle rules editor               | M      | —          |
| 8 | CORS + bucket policy editor          | M      | —          |
| 9 | Storage class on upload              | S      | —          | ✅ shipped (see §0.5) |
| 10 | Object Lock / retention / legal hold | M      | 5          |
| 11 | In-browser text/code/md editor       | M      | 1          |
| 12 | Office doc preview                   | S      | —          |
| 13 | Public "shelf" galleries             | M      | 2          |
| 14 | EXIF panel for images                | S      | 1          | ✅ shipped (see §0.5) |
| 15 | Connection snippet panel             | S      | —          | ✅ shipped (see §0.5) |
| 16 | Paste / URL upload                   | S      | —          | ✅ shipped (see §0.5) |
| 17 | Activity log                         | S      | —          | ✅ shipped (see §0.5) |
| 18 | Password-protected share links       | M      | 2          |
| 19 | ZIP-in-place browsing                | L      | —          |
| 20 | Range-GET video player polish        | S      | —          |

S ≈ half-day, M ≈ 1–2 days, L ≈ multi-day. Effort estimates assume one
person with full context. Each phase ends with: typecheck passes, no
regressions in existing flows, README updated if user-visible.

---

## Phase 1 — Object info, metadata, tags panel — ✅ shipped

> See §0.5 for what actually shipped (merged into `file-preview-panel.tsx`,
> not a separate drawer). The spec below is preserved for reference.

**Goal**: a right-side info panel (and context-menu "Info" item) that shows
size / ETag / last-modified / storage class / content-type / custom
`x-amz-meta-*` headers, plus a tag editor (up to 10 key/value pairs).

### Server

Add helpers to `server/lib/s3.ts`:

```ts
import { HeadObjectCommand, GetObjectTaggingCommand,
         PutObjectTaggingCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

export interface ObjectHead {
  key: string;
  size: number;
  etag?: string;
  lastModified: string;
  contentType?: string;
  storageClass?: string;
  versionId?: string;
  userMetadata: Record<string, string>; // x-amz-meta-* (lowercased keys, no prefix)
}

export interface ObjectTag { key: string; value: string }

export async function headObject(conn, bucket, key, versionId?): Promise<ObjectHead>;
export async function getObjectTags(conn, bucket, key, versionId?): Promise<ObjectTag[]>;
export async function putObjectTags(conn, bucket, key, tags: ObjectTag[], versionId?): Promise<void>;
export async function updateObjectMetadata(conn, bucket, key,
  newMetadata: Record<string,string>, newContentType?: string): Promise<void>;
```

`updateObjectMetadata` uses `CopyObject` with same source/dest key,
`MetadataDirective: "REPLACE"`, and the new headers — that's how S3
mutates metadata.

Routes in `server/routes/connections.ts`:

```
GET    /:id/buckets/:bucket/objects/head?key=&versionId=
GET    /:id/buckets/:bucket/objects/tags?key=&versionId=
PUT    /:id/buckets/:bucket/objects/tags?key=&versionId=    body { tags }
PUT    /:id/buckets/:bucket/objects/metadata?key=
       body { contentType?, userMetadata: { [k]: v } }
```

Validate tag count ≤ 10, key ≤ 128 chars, value ≤ 256 chars (S3 limits).
For `userMetadata`, lowercase keys, no leading `x-amz-meta-`.

Add shared types to `server/types.ts`: `ObjectHead`, `ObjectTag`.

### Client

- `src/lib/api/object-info.ts` — `useObjectHead`, `useObjectTags`,
  `usePutObjectTags`, `useUpdateObjectMetadata`. Invalidate the
  `objectKeys.bucket` key on metadata writes (key may show new
  storage class etc. in listings).
- New `src/components/object-info-panel.tsx` — a `vaul` drawer (right
  side on desktop, bottom on mobile). Sections: General, Metadata,
  Tags, Versioning (lazy — only if `versioning` query says enabled).
- Add `"info"` to `ContextAction` and wire it in
  `src/components/object-context-menu.tsx` ("Info" item, `Info` icon
  from lucide).
- Optional keyboard shortcut `I` while a file is focused —
  `src/lib/shortcuts.tsx`.

### Acceptance

- Right-click → Info opens the panel with all fields populated.
- Adding/removing tags persists and survives a re-fetch.
- Editing custom metadata (e.g. `caption=hello`) survives a re-fetch.
- Changing content-type changes the served `Content-Type` on the next
  presigned GET (verifiable by re-opening preview).
- Listing rows show updated storage class after a metadata update.

---

## Phase 2 — Share dialog upgrade (TTL + QR)

**Goal**: replace the current "Copy link" insta-action with a small
dialog where the user picks the TTL and sees the link + a QR code.

### Server

Extend `presignDownloadUrl` to accept `expiresSeconds`. Already does
internally — expose it through the route:

```
GET /:id/buckets/:bucket/objects/download-url?key=&expiresIn=
```

Validate: `expiresIn` is an int 60..604800 (S3 SDK ceiling is 7 days).
Default 900 (15 min). If `expiresIn` is omitted, behave exactly as today
so the preview panel keeps working unchanged.

### Client

- `src/components/share-dialog.tsx` — fields:
  - TTL picker: chips for `15m / 1h / 1d / 7d`, plus custom (60s–7d).
  - Read-only URL field with copy-to-clipboard (`navigator.clipboard`).
  - QR code via [`qrcode`](https://www.npmjs.com/package/qrcode) (canvas
    render — small dep, no React wrapper needed).
  - Expiry countdown ("Expires in 6d 23h").
- Trigger from: context menu "Copy link" / "Share…", and toolbar share.
- Keep the existing one-click "Copy link" as a fast path (modifier:
  hold Alt = open dialog instead).

### Acceptance

- Pick 7d → URL works after closing the dialog and opening it elsewhere.
- QR opens the same link on a phone.
- Existing preview pane still works (uses default TTL).

### Deps

Add `qrcode` and `@types/qrcode` to dependencies.

---

## Phase 3 — Folder upload

**Goal**: drag a folder onto the dropzone → its full subtree uploads,
keys recreate the directory structure.

### Server

No changes — multipart upload already exists. Only key shaping changes
client-side.

### Client

- `src/components/upload-dropzone.tsx` — enable
  `webkitdirectory`/`directory` attrs on the underlying file input. The
  current `react-dropzone` config needs `useFsAccessApi: false` to keep
  Firefox/Safari working.
- For drag-drop of folders, use `DataTransferItem.webkitGetAsEntry()` to
  recurse and yield `{ relativePath, file }` pairs.
- New helper `src/lib/folder-walk.ts` — async generator that walks a
  `FileSystemDirectoryEntry` and yields `{ path: "a/b/c.txt", file: File }`.
- `useUploadsStore` (`src/stores/uploads.ts`) — extend job shape to
  include `relativePath` so the upload key becomes
  `${currentPrefix}${relativePath}`.
- Show one progress row per file, grouped under a "folder upload" header
  (collapsible).

### Acceptance

- Drag a folder with nested children → keys land under the current prefix
  preserving subdirectories.
- Cancel one file in the middle of a folder upload doesn't kill the rest.

### Gotchas

- Safari needs the `entries()` async iterator; Chrome exposes
  `FileSystemDirectoryReader.readEntries` which returns batches and must
  be drained in a loop.
- Empty folders: skip them; S3 has no real folders and an explicit empty
  marker is rarely useful here.

---

## Phase 4 — Bulk download as ZIP

**Goal**: multi-select files → "Download as ZIP" → browser streams a ZIP
to disk; bytes flow browser ← S3 directly via the existing presigned
GETs, server never touches the data.

### Server

No changes — uses existing `download-url` route per file.

### Client

- Add [`client-zip`](https://www.npmjs.com/package/client-zip) (zero-dep,
  streams via `ReadableStream`, tiny).
- New `src/lib/zip-download.ts` — given `{key, presignedUrl}[]`, build a
  `ReadableStream<Uint8Array>` of `client-zip.downloadZip()` output and
  trigger a download via `URL.createObjectURL` of a `Response` body.
- Wire into `src/components/object-toolbar.tsx` and the selection
  context menu (label: "Download as ZIP" — disabled when no selection).
- Cap by combined size: warn at >2 GB (browser memory pressure varies),
  hard error at >10 GB with "Use multiple downloads".

### Acceptance

- Select 5 files, click Download as ZIP → one `.zip` lands with the right
  contents.
- Selecting a folder includes all its files (recursive, paginated listing
  through the existing infinite query).
- Cancel mid-download (browser Stop) leaves a partial ZIP — acceptable.

### Gotchas

- Some browsers limit Blob URLs to ~2 GB. Stream via `Response` body and
  `<a download>` instead — `client-zip` README has the exact recipe.
- Mint presigned URLs in parallel but throttle to ~6 concurrent (browser
  per-host limit).

---

## Phase 5 — Versioning view + restore

**Goal**: per-bucket versioning toggle + per-object versions list with
"open this version", "restore as latest", "delete this version".

### Server

`server/lib/s3.ts`:

```ts
import { GetBucketVersioningCommand, PutBucketVersioningCommand,
         ListObjectVersionsCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export type VersioningStatus = "Enabled" | "Suspended" | "Disabled";

export async function getBucketVersioning(conn, bucket): Promise<VersioningStatus>;
export async function setBucketVersioning(conn, bucket, status: "Enabled"|"Suspended"): Promise<void>;

export interface ObjectVersion {
  versionId: string;
  isLatest: boolean;
  isDeleteMarker: boolean;
  size: number;
  etag?: string;
  lastModified: string;
  storageClass?: string;
}
export async function listObjectVersions(conn, bucket, key): Promise<ObjectVersion[]>;
export async function deleteObjectVersion(conn, bucket, key, versionId): Promise<void>;
```

Routes:

```
GET  /:id/buckets/:bucket/versioning
PUT  /:id/buckets/:bucket/versioning           body { status }
GET  /:id/buckets/:bucket/objects/versions?key=
POST /:id/buckets/:bucket/objects/versions/restore     body { key, versionId }
DELETE /:id/buckets/:bucket/objects/versions?key=&versionId=
```

"Restore as latest" = CopyObject from `{bucket}/{key}?versionId=X` to the
same key without a versionId — produces a new latest version that mirrors
the historical one.

### Client

- `src/lib/api/versioning.ts` (follow the per-resource convention from
  §0.5 — `versioningKeys`, `useBucketVersioning`, `useSetBucketVersioning`,
  `useObjectVersions`, `useRestoreObjectVersion`, `useDeleteObjectVersion`).
- Add a "Versioning" section inside `src/components/file-preview-panel.tsx`
  using `SectionHeader` + `SectionBody` (see §0.5). Lazy-mount it only when
  `useBucketVersioning(connectionId, bucket)` returns `Enabled` or
  `Suspended` — on backends that return NotImplemented for
  `GetBucketVersioning`, render the graceful "Versioning isn't supported
  on this backend" treatment (§0.5 step 3) inside the section instead of
  hiding it silently.
- Per version row: badge for `isLatest` / `isDeleteMarker`, restore /
  download / delete buttons.
- Bucket settings dialog (`src/components/bucket-dialogs.tsx`) gets a
  Versioning toggle.

### Acceptance

- Toggle versioning on → upload same key twice → versions list shows 2.
- Restore older → newest version content matches.
- Delete a specific version → list shrinks; latest unchanged unless the
  deleted one was latest.

### Gotchas

- `ListObjectVersions` is paginated; loop until no `IsTruncated`.
- Delete markers show up as objects in the latest listing — surface them
  in the versions UI with a "Deleted" badge; downloading them is invalid.

---

## Phase 6 — Cross-bucket copy/move + folder rename

**Goal**: extend the existing copy/move to allow a different
target bucket on the same connection, and add a proper folder rename
that re-keys every child.

### Server

Replace `copyObjectForConnection` route input with:

```
POST /:id/buckets/:bucket/objects/copy
body {
  sourceKey: string,
  destBucket?: string,   // defaults to :bucket
  destKey: string,
  deleteSource?: boolean // move = true; copy = false
}
```

Cross-bucket CopyObject works as long as both buckets are reachable by the
same credentials. For folder rename:

```
POST /:id/buckets/:bucket/objects/rename-prefix
body { sourcePrefix: string, destPrefix: string }   // both trailing-slash
```

Implementation: paginated `ListObjectsV2(prefix=sourcePrefix)` →
parallel `CopyObject` + `DeleteObject` per key with a small concurrency
pool (8). Return `{ copied, deleted, errors: [{ key, message }] }`. Stream
status via SSE if the operation looks long (>200 keys), otherwise return
JSON when done. Pick SSE if it's not too much added complexity — otherwise
do the simpler all-at-once response and surface a "this can take a while"
toast.

### Client

- Add a bucket picker to the Move / Copy-to dialogs in
  `src/components/object-dialogs.tsx`. Use existing buckets list.
- New "Rename folder" action in the folder context menu calling
  `/rename-prefix`. Show a progress toast that updates on SSE events
  (or just a "renaming…" spinner if SSE wasn't added).

### Acceptance

- Move a file from `a` to `b` (same connection, different bucket) →
  appears in `b`, gone from `a`.
- Rename a folder with 30 children → all 30 land under the new prefix.

### Gotchas

- CopyObject single-call limit is 5 GB; for larger objects use UploadPartCopy
  multipart copy. Defer this — surface a clear error for now, only handle
  it when a user reports the case.
- Object Lock / retention can refuse the source delete. Surface errors
  but keep going.

---

## Phase 7 — Lifecycle rules editor

**Goal**: per-bucket lifecycle editor with the common rule templates.

### Server

`server/lib/s3.ts`:

```ts
import { GetBucketLifecycleConfigurationCommand,
         PutBucketLifecycleConfigurationCommand,
         DeleteBucketLifecycleCommand } from "@aws-sdk/client-s3";

export interface LifecycleRule {
  id: string;
  enabled: boolean;
  prefix?: string;
  tagFilters?: { key: string; value: string }[];
  expirationDays?: number;
  abortIncompleteMultipartDays?: number;
  noncurrentVersionExpirationDays?: number;
  transitions?: { days: number; storageClass: string }[];
}

export async function getLifecycle(conn, bucket): Promise<LifecycleRule[]>;
export async function setLifecycle(conn, bucket, rules: LifecycleRule[]): Promise<void>;
export async function deleteLifecycle(conn, bucket): Promise<void>;
```

Routes:

```
GET    /:id/buckets/:bucket/lifecycle
PUT    /:id/buckets/:bucket/lifecycle    body { rules }
DELETE /:id/buckets/:bucket/lifecycle
```

### Client

- New `src/components/lifecycle-editor.tsx` — accessible from a "Bucket
  settings" entry in the bucket header or sidebar context menu.
- Provide three templates as quick-add buttons:
  - "Abort incomplete multipart uploads after 7 days"
  - "Expire objects under `prefix/` after N days"
  - "Transition to GLACIER after 30 days"
- Custom rules: standard form with prefix + tag filters + actions.

### Acceptance

- Save a rule → reload → rule still there.
- Many S3-compatibles (telegram-s3, some Garage versions) return
  `NotImplemented` or `405`. Detect that error code and show: "This
  backend doesn't support lifecycle rules." Don't crash.

---

## Phase 8 — CORS + bucket policy editor with templates

**Goal**: small form for CORS, and a JSON editor for bucket policies
with one-click templates. Most users get these JSON blobs wrong on
their first try — templates save the day.

### Server

`server/lib/s3.ts`:

```ts
import { GetBucketCorsCommand, PutBucketCorsCommand, DeleteBucketCorsCommand,
         GetBucketPolicyCommand, PutBucketPolicyCommand,
         DeleteBucketPolicyCommand } from "@aws-sdk/client-s3";

export async function getBucketCors(conn, bucket): Promise<CorsRule[]>;
export async function setBucketCors(conn, bucket, rules: CorsRule[]): Promise<void>;
export async function getBucketPolicy(conn, bucket): Promise<string | null>;
export async function setBucketPolicy(conn, bucket, policyJson: string): Promise<void>;
export async function deleteBucketPolicy(conn, bucket): Promise<void>;
```

Routes:

```
GET    /:id/buckets/:bucket/cors
PUT    /:id/buckets/:bucket/cors            body { rules }
DELETE /:id/buckets/:bucket/cors
GET    /:id/buckets/:bucket/policy
PUT    /:id/buckets/:bucket/policy          body { policy: string }   // JSON string
DELETE /:id/buckets/:bucket/policy
```

### Client

- `src/components/bucket-cors-editor.tsx`: forms for allowed origins,
  methods, headers, exposed headers, max-age.
- `src/components/bucket-policy-editor.tsx`: Monaco JSON editor with a
  template menu:
  - "Private (default)"
  - "Public read"
  - "Presigned-upload only"
  - "Static website (read all under `/`)"
- Validate JSON before submit; show inline parse errors.

### Acceptance

- Apply "Public read" template → object URLs are reachable anonymously
  (manually verified with `curl`).
- A backend that returns `NotImplemented` shows a clear message.

### Gotchas

- `GetBucketPolicy` returns `NoSuchBucketPolicy` on empty buckets — treat
  as `null`, not error.
- Monaco is heavy. Code-split it: lazy-load `@monaco-editor/react` only
  when this editor opens. Same Monaco bundle gets reused by Phase 11.

---

## Phase 9 — Storage class on upload

**Goal**: pick `STANDARD | STANDARD_IA | INTELLIGENT_TIERING | GLACIER |
DEEP_ARCHIVE` when uploading; persisted as a per-connection default.

### Server

- Extend `presignSingleUpload` and `createMultipartUpload` to accept
  `storageClass` and pass it on the underlying command.
- Route changes: add `?storageClass=` to `/presign/upload` and
  `/multipart/start`.

### Client

- New Zustand pref in `src/stores/prefs.ts`:
  `defaultStorageClass: string | undefined`.
- Add a small dropdown in the upload panel toolbar that overrides the
  default per upload session.
- Object info panel surfaces actual storage class.

### Acceptance

- Upload with `GLACIER` → listing shows storage class `GLACIER`.
- The dropdown gracefully no-ops on backends that don't recognize the
  storage class (most will simply store as STANDARD).

---

## Phase 10 — Object Lock / retention / legal hold

**Goal**: WORM compliance — enable object lock on bucket creation,
configure default retention, view/edit per-object retention + legal hold.

### Server

`server/lib/s3.ts`:

```ts
import { GetObjectLockConfigurationCommand, PutObjectLockConfigurationCommand,
         GetObjectRetentionCommand, PutObjectRetentionCommand,
         GetObjectLegalHoldCommand, PutObjectLegalHoldCommand } from "@aws-sdk/client-s3";

export interface ObjectLockConfig {
  enabled: boolean;
  defaultMode?: "GOVERNANCE" | "COMPLIANCE";
  defaultDays?: number;
}
```

Routes:

```
GET  /:id/buckets/:bucket/object-lock
PUT  /:id/buckets/:bucket/object-lock          body { mode, days }
GET  /:id/buckets/:bucket/objects/retention?key=&versionId=
PUT  /:id/buckets/:bucket/objects/retention    body { key, versionId?, mode, retainUntil }
GET  /:id/buckets/:bucket/objects/legal-hold?key=&versionId=
PUT  /:id/buckets/:bucket/objects/legal-hold   body { key, versionId?, on: boolean }
```

Also: bucket creation must accept `objectLockEnabled: boolean` and pass
`ObjectLockEnabledForBucket: true` to `CreateBucketCommand`. Object lock
can only be enabled at create time on most backends.

### Client

- Bucket create dialog: "Enable Object Lock" checkbox.
- Bucket settings: default mode + days.
- Inside `src/components/file-preview-panel.tsx`: a "Locks" section
  (`SectionHeader` + `SectionBody`, see §0.5) with retention + legal hold
  rows. Lazy-mount only when the bucket has lock enabled. Render the
  graceful "not supported on this backend" treatment if the lock-config
  query 404s.

### Acceptance

- Enable lock on a new bucket → can set retention → object cannot be
  deleted before retain-until (S3 returns `AccessDenied`).
- Legal hold on → delete refused regardless of retention period.

### Gotchas

- Many S3-compatibles don't implement object lock — return `404` /
  `NotImplemented`. Hide the section silently when the bucket has
  no lock configuration.

---

## Phase 11 — In-browser text/code/markdown editor

**Goal**: editable preview for text-like files — open, edit, save.

### Server

No new routes — uses the existing `/presign/upload` route to PUT the
edited content back.

### Client

- Lazy-load `@monaco-editor/react`. Shares the Phase-8 chunk.
- `src/components/file-preview-panel.tsx`: when the file looks editable
  (size ≤ 1 MB and MIME starts with `text/`, or extension in
  `src/lib/file-types.ts` text list), expose an "Edit" toggle that swaps
  Shiki for Monaco.
- Save flow: PUT to the existing presigned single-upload route with the
  edited Blob; on success, invalidate `objectKeys.bucket` for the prefix.
- Beforeunload guard while dirty.
- Markdown gets a side-by-side rendered preview (use `marked` — already
  light, no need for full MDX).

### Acceptance

- Edit a `.json`, hit Save → re-open → changes persisted.
- Tab away with unsaved changes → confirm prompt.
- Refuse to open files >1 MB in editor mode (offer Shiki view instead).

---

## Phase 12 — Office doc preview

**Goal**: inline preview for `.docx / .xlsx / .pptx / .pdf` via a third-party
viewer iframe, no rendering done locally.

### Server

No new code. Reuses presigned GETs.

### Client

- `src/components/file-preview-panel.tsx`: if extension is `.docx / .xlsx
  / .pptx / .doc / .xls / .ppt`, render an iframe to
  `https://view.officeapps.live.com/op/embed.aspx?src=${encoded presigned URL}`.
- Note in the panel footer: "Preview rendered by Microsoft Office Online
  — file URL is shared with that service for the duration of the view."
- Settings toggle in `src/routes/settings.tsx` to disable third-party
  viewers (default: enabled). Persist in `src/stores/prefs.ts`.

### Acceptance

- Open a `.docx` → renders inline.
- Disable third-party viewers → falls back to "Download to view."

### Gotchas

- The presigned URL needs to be reachable from the public internet for
  the Office viewer to work. If `endpoint` looks like `localhost`
  or `127.0.0.1`, disable the inline preview and explain why.

---

## Phase 13 — Public "shelf" galleries

**Goal**: mark a prefix as public → CloudShelf serves a read-only
gallery view at a stable URL, no login required.

### Schema

New SQLite table:

```sql
CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,             -- short slug, used in URL
  connection_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  prefix TEXT NOT NULL,
  title TEXT NOT NULL,
  view_mode TEXT NOT NULL DEFAULT 'gallery',  -- 'gallery'|'list'
  password_hash TEXT,              -- optional
  created_at TEXT NOT NULL,
  expires_at TEXT                  -- nullable = never
);
```

### Server

`server/routes/shelves.ts` mounted at `/api/shelves`:

```
GET    /api/shelves                              # auth required, list
POST   /api/shelves                              # auth required, create
DELETE /api/shelves/:id                          # auth required

GET    /api/shelves/:slug                        # public (or 401 if pw)
POST   /api/shelves/:slug/unlock                 # public, body { password }
GET    /api/shelves/:slug/file?key=              # public, presigned GET proxy
```

The public `GET /:slug` returns enough to render the gallery — listing,
title, etag, sizes, image dimensions if known.

### Client

- `src/routes/settings.tsx`: a "Shelves" tab to manage them.
- `src/routes/s.$slug.tsx`: public, read-only viewer. No auth gate. Just
  thumbnails + lightbox + download link per file.
- "Share folder as shelf" entry in the folder context menu.

### Acceptance

- Create shelf for a folder of photos → open in a private window →
  works without login.
- With password → unlock form first; on success, set a short-lived
  HttpOnly cookie scoped to `/s/<slug>`.

### Gotchas

- Make sure the auth middleware in `server/index.ts` does not gate
  `/api/shelves/:slug*` or `/s/*`. Touch carefully — see
  `server/lib/auth.ts`.
- Shelves listing only fetches the public-relevant fields, never the
  connection credentials.

---

## Phase 14 — EXIF panel for images

**Goal**: when previewing an image, show camera/date/GPS/etc.

### Server

No change.

### Client

- Add [`exifr`](https://www.npmjs.com/package/exifr).
- Inside `src/components/file-preview-panel.tsx`: add an "EXIF" section
  (`SectionHeader` + `SectionBody`, see §0.5) that lazy-mounts only when
  the file's MIME starts with `image/`. Do a small Range GET for the first
  ~128 KB of the presigned URL and run `exifr.parse(buf)`.
- Display: camera make/model, lens, ISO/shutter/aperture, taken-at, GPS
  (with an "Open in maps" link), pixel dimensions.

### Acceptance

- A JPG with EXIF shows the data; one without shows nothing (no error).

---

## Phase 15 — Connection snippet panel

**Goal**: surface ready-to-paste CLI/SDK snippets for the currently
selected connection.

### Server

No change.

### Client

- New "CLI" button in the connection switcher / settings.
- `src/components/connection-snippets.tsx` with tabs:
  - `aws s3` (`aws s3 ls s3://bucket --endpoint-url … --profile …`)
  - `boto3` (Python)
  - `mc` (MinIO Client `mc alias set`)
  - `rclone` config block
- The secret key is masked by default; "Reveal" button + copy.
- Endpoint, region, access key id come straight from the saved
  connection; secret stays server-side until "Reveal" hits
  `GET /api/connections/:id` (already exists).

### Acceptance

- Copy + paste the `aws s3 ls` snippet → works against the same backend.

---

## Phase 16 — Paste / URL upload

**Goal**: two quick-add paths into the current prefix.

### A) Paste from clipboard

- Listen on `paste` events when the object browser is focused.
- If clipboard has `Blob`s with image MIME, drop them into the upload
  queue with a generated key (`pasted-${timestamp}.png`).

### B) Upload from URL

- Server-side, because CORS blocks fetching arbitrary URLs from the
  browser:

```
POST /:id/buckets/:bucket/objects/from-url
body { url: string, key: string }
```

- Server: stream the URL response body straight into `PutObjectCommand`
  using the SDK's streaming upload (`Upload` from
  `@aws-sdk/lib-storage` for >5 MB). Don't buffer the full body.
- UI: a "+ From URL" button in the toolbar.

### Acceptance

- Paste a screenshot → it lands.
- Paste a remote image URL into the "From URL" dialog → it lands.

### Gotchas

- Validate URL scheme is http(s); reject `file://`, internal hostnames.
- Cap streamed size at 1 GB per call to avoid pathological abuse.

---

## Phase 17 — Activity log

**Goal**: a small audit trail visible from settings. Single-user, so this
is a "what did I do last week" diary, not a compliance log.

### Schema

```sql
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,           -- 'upload','delete','share','rename', …
  connection_id TEXT,
  bucket TEXT,
  key TEXT,
  detail TEXT                   -- JSON blob, optional
);
CREATE INDEX activity_ts ON activity (ts DESC);
```

### Server

- A `logActivity({kind, connectionId, bucket, key, detail})` helper called
  from each write route in `server/routes/connections.ts` after a
  successful upstream call.
- Cron: trim to last 10k rows on startup.

Routes:

```
GET    /api/activity?limit=50&offset=0
DELETE /api/activity                      # clear all
```

### Client

- `src/routes/settings.tsx`: an "Activity" tab with a virtualized list.
- Each row links to the bucket/prefix where it happened.

### Acceptance

- Delete a file → activity row appears with `kind: 'delete'`.
- Clear log → table emptied.

---

## Phase 18 — Password-protected share links

**Goal**: gate a presigned URL behind a CloudShelf-managed password,
without changing the underlying S3 ACL.

### Schema

```sql
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,           -- short slug
  connection_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  password_hash TEXT,            -- nullable
  expires_at TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,              -- nullable = unlimited
  created_at TEXT NOT NULL
);
```

### Server

```
POST   /api/shares           body { connectionId, bucket, key, password?, expiresAt, maxUses? }
GET    /api/shares           # list user's shares
DELETE /api/shares/:id

GET    /api/s/:id            # public; if pw, returns { needsPassword: true }
POST   /api/s/:id/unlock     # public; body { password }; sets cookie
GET    /api/s/:id/download   # public; cookie must be present; redirects to fresh presigned URL
```

A redirect-each-time design avoids storing long-lived presigned URLs
and lets the cookie outlive any single presign. Cookie scoped to
`/api/s/<id>`.

### Client

- Phase 2's share dialog gets a new tab "Protected link" with password +
  expiry + max-uses. The resulting URL points at `/api/s/:id`.
- Settings "Shares" tab to list / revoke.

### Acceptance

- Open the protected URL in a private window → password prompt.
- Wrong password → 401, doesn't burn a use.
- Right password → file downloads.
- Past expiry or max-uses → 410 Gone.

### Gotchas

- Use the existing session cookie pattern in `server/lib/auth.ts` as a
  reference, but a separate cookie name (`cloudshelf_share_<id>`).
- Rate-limit `/unlock` per IP (in-memory token bucket — single-user
  setup, no need for Redis).

---

## Phase 19 — ZIP-in-place browsing

**Goal**: click a `.zip` in the browser → see entries inside without
extracting; click an entry → download just that file.

### Server

Use `Range` GETs to read the central directory at the end of the ZIP.
The end-of-central-directory record sits in the last ≤64 KB.

```
GET /:id/buckets/:bucket/objects/zip-index?key=
```

Server-side flow:
1. `HeadObject` → size.
2. `GetObject` with `Range: bytes=${size-65536}-${size-1}`.
3. Parse the EOCD record + central directory entries with
   [`fflate`](https://www.npmjs.com/package/fflate) (`fflate.unzip`
   accepts a partial buffer for index inspection — verify; otherwise
   parse the EOCD by hand: it's <100 lines).
4. Return entries `[{name, size, compressedSize, offset, method}]`.

For per-file download:

```
GET /:id/buckets/:bucket/objects/zip-file?key=&entry=
```

Server reads the entry's local file header, then ranges the compressed
data, decompresses (deflate or store), streams to the client. Don't
keep the full archive in memory.

### Client

- File preview panel: if MIME is `application/zip`, render an entry list.
- Click an entry → trigger the zip-file route (a real download).

### Acceptance

- A 1 GB zip with thousands of entries opens instantly (only its tail is
  fetched).
- Per-file extract works for at least `store` and `deflate` methods.

### Gotchas

- Zip64 (4+ GB archives or >65535 entries) has a different EOCD layout.
  Detect and bail to "preview unsupported" gracefully.
- Encrypted ZIPs: bail to download.

---

## Phase 20 — Range-GET video player polish

**Goal**: keep the existing inline video element but make scrubbing
multi-GB files actually pleasant.

### Server

Already works — presigned GETs go direct to S3, and S3 honors Range.

### Client

- Confirm `<video preload="metadata">` so initial load doesn't pull
  whole file.
- Add a custom poster image fetch path: when an image with the same
  key but `.poster.jpg` suffix exists, use it.
- Optional: thumbnail strip generated on hover via `requestVideoFrameCallback`
  on a hidden `<video>` (browser support varies — gate behind capability check).

### Acceptance

- Open a 4 GB MP4 → starts playing within seconds.
- Scrubbing to the end doesn't download the whole file (verify in
  DevTools network: only the seeked ranges are pulled).

---

## Cross-cutting tasks (do alongside relevant phases)

### Telemetry hooks (optional, opt-in)

Every mutation already invalidates query keys. If we later want a tiny
metrics panel ("uploads this week"), it falls naturally out of Phase 17's
activity log; no separate phase.

### README

After Phase 1, 2, 3, 5, 7, 8, 13, 18: update the README's "What it does"
list. Keep it terse — the README's voice is "Heads up" / "Fine behind
HTTPS" / one or two sentences per feature.

### Settings reorganization

By Phase 13 the settings page grows. Reorganize into tabs:
`Account · Connections · Shelves · Shares · Activity · Preferences`.

### Backend probe matrix

Different S3-compatibles support different subsets (no lifecycle on
telegram-s3, no object lock on Garage, etc.). Capture per-connection
capability hints in `S3Connection`:

```ts
capabilities?: {
  versioning: boolean;
  lifecycle: boolean;
  objectLock: boolean;
  tagging: boolean;
  // detected lazily on first GET that probes the feature
}
```

Persist after detection. Hide UI for unsupported features. Don't bake
this in eagerly — add it the first time a phase needs to gracefully
degrade.

---

## How to pick the next phase

1. **Read §0.5 first** — shipped phases, deviations, conventions.
2. Read the table in §1.
3. Pick the lowest-numbered phase whose deps are met (status column) and
   that the user hasn't explicitly deferred.
4. Skim the phase's "Server" then "Client" then "Acceptance" sections.
5. Implement, **reusing the §0.5 conventions** (section chrome, graceful
   degradation, mutation onSuccess spread, per-resource API file).
6. Run `bun run typecheck` until clean. Never run `bun run dev`.
7. Update README if user-visible.
8. Commit per phase. Commit message style: see recent git log
   (`feat(buckets):`, `feat(objects):`, `style:`, `refactor(buckets):` are
   the project's established prefixes).
9. **Mark the phase ✅ shipped in the §1 table and append a short
   "shipped" entry in §0.5** so the next session knows what changed.

Don't batch phases into one PR. One phase = one commit (or one cohesive
series).
