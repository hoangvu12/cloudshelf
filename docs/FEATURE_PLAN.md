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

### Eligibility snapshot (as of Phase 4 ship)

Pickable now, in rough recommend-first order:

- **5** Versioning view + restore (M, unblocked by Phase 1)
- **14** EXIF panel for images (S, unblocked by Phase 1)
- **9** Storage class on upload (S, no deps)
- **15** Connection snippet panel (S, no deps)
- **16** Paste / URL upload (S, no deps — reuse Phase-3 `UploadInputFile`)
- **17** Activity log (S, no deps)
- **20** Range-GET video player polish (S, no deps)
- **2-blocked**: 13 (shelves), 18 (protected share links) — eligible.
- Heavier M/L: 6, 7, 8, 10, 11, 12, 19.

---

## 1. Phase ordering at a glance

| # | Phase                               | Effort | Depends on | Status |
|---|--------------------------------------|--------|------------|--------|
| 1 | Object info, metadata, tags panel    | M      | —          | ✅ shipped (see §0.5) |
| 2 | Share dialog upgrade (TTL + QR)      | S      | —          | ✅ shipped (see §0.5) |
| 3 | Folder upload                        | S      | —          | ✅ shipped (see §0.5) |
| 4 | Bulk download as ZIP                 | S      | —          | ✅ shipped (see §0.5) |
| 5 | Versioning view + restore            | M      | 1          |
| 6 | Cross-bucket copy/move + folder rename | M    | —          |
| 7 | Lifecycle rules editor               | M      | —          |
| 8 | CORS + bucket policy editor          | M      | —          |
| 9 | Storage class on upload              | S      | —          |
| 10 | Object Lock / retention / legal hold | M      | 5          |
| 11 | In-browser text/code/md editor       | M      | 1          |
| 12 | Office doc preview                   | S      | —          |
| 13 | Public "shelf" galleries             | M      | 2          |
| 14 | EXIF panel for images                | S      | 1          |
| 15 | Connection snippet panel             | S      | —          |
| 16 | Paste / URL upload                   | S      | —          |
| 17 | Activity log                         | S      | —          |
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
