# CloudShelf — Plan

A generic S3-compatible web app, optimized for [telegram-s3](../telegram-s3)
as the default backend. Single-user, self-hosted, personal scale.

**Distribution model:** self-hosted website with its own backend. Run it on
your machine (or a home server), open it in any browser on the LAN.
Inspired by [s3-compass](https://github.com/C0RE1312/s3-compass) and
[cloudlena/s3manager](https://github.com/cloudlena/s3manager); closer to
the s3-compass model (own DB, multi-connection) than to s3manager's
env-vars-only deployment.

---

## 1. Tech Stack

### Frontend (Vite SPA, runs in browser)

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite 6** | Fast HMR, builds to static `dist/` |
| Framework | **React 19** + **TypeScript 5 (strict)** | Standard, typed |
| Routing | **TanStack Router v1** (file-based) | Type-safe params, auto-generated route tree |
| Server state | **TanStack Query v5** | Caching, optimistic updates, request dedup |
| Per-device state | **Zustand 5** (+ `persist(localStorage)`) | UI prefs, active connection id, upload queue UI |
| Forms | **React Hook Form** + **Zod** + `@hookform/resolvers` | Form validation, shared schema with server |
| CSS | **Tailwind v4** (no config file, `@theme inline` in CSS) | Utility-first |
| Components | **shadcn/ui** (`new-york`, neutral baseColor) | Copy-paste Radix primitives |
| Theming | **next-themes** | light / dark / system, class-based |
| Icons | **lucide-react** | Tree-shakes |
| Toasts | **sonner** | Promise-aware (good for upload progress) |
| Command palette | **cmdk** | ⌘K nav |
| Drag-drop | **react-dropzone** | Folder upload support |
| Virtualization | **@tanstack/react-virtual** | 10k+ item lists |

The browser **never imports `@aws-sdk/*`** — all S3 work happens on the server.
File transfers use **presigned URLs** issued by the server, so bytes go
browser → S3 direct without proxying through the Bun process.

### Backend (Bun + Hono server)

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun 1.3** | Fast, single binary, native SQLite |
| HTTP framework | **Hono 4** | Tiny, TS-native, runs on Bun |
| Database | **`bun:sqlite`** (built-in) | Zero-dep, single file (`./data/cloudshelf.db`) |
| S3 SDK | **`@aws-sdk/client-s3` v3** + **`s3-request-presigner`** | Used server-side |
| Validation | **Zod** | Same package as frontend, schemas shared |

### Tooling

- **TypeScript project references** — `tsconfig.app.json` (frontend), `tsconfig.server.json` (backend), `tsconfig.node.json` (vite config). Root `tsconfig.json` references all three; `bun run typecheck` (= `tsc -b`) checks all.
- **concurrently** — runs `dev:server` + `dev:ui` together
- **cross-env** — Windows-safe `NODE_ENV=production` for `start`

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (Vite SPA at :5173 in dev, /dist in prod)            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ React + TanStack Router + TanStack Query                │  │
│  │   ├─ src/lib/api/client.ts   — typed fetch wrapper      │  │
│  │   ├─ src/lib/api/*.ts        — RQ hooks per resource    │  │
│  │   └─ src/stores/             — per-device UI state      │  │
│  └────────────────┬────────────────────────────────────────┘  │
└───────────────────┼───────────────────────────────────────────┘
                    │ /api/*   (Vite proxy in dev, same-origin in prod)
                    ▼
┌───────────────────────────────────────────────────────────────┐
│  Bun + Hono API server (:3001 in dev, :3001 in prod by default)│
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ server/index.ts        — Hono app, route mounting       │  │
│  │ server/routes/*.ts     — HTTP handlers                  │  │
│  │ server/lib/s3.ts       — S3Client factory + helpers     │  │
│  │ server/db.ts           — bun:sqlite + queries           │  │
│  └────────────────┬────────────────────────────────────────┘  │
└───────────────────┼───────────────────────────────────────────┘
                    │
                    ▼
            ┌────────────────┐         ┌──────────────────┐
            │ SQLite file    │         │ S3-compatible    │
            │ data/          │         │ endpoint         │
            │  cloudshelf.db │         │ (telegram-s3,    │
            └────────────────┘         │  MinIO, R2, AWS) │
                                       └──────────────────┘
```

**Why this shape:**

- **Self-hosted website** — setup once on the server, accessible from any browser on the LAN. Matches what the user wants ("not just localStorage in one browser").
- **Server owns the credentials** — they live in SQLite, never reach the browser.
- **Single-user assumption** — no auth, no login. Don't expose to the public internet (same caveat as s3-compass).
- **Generic S3** — multiple connection profiles, can manage R2 / MinIO / AWS as well as telegram-s3.
- **Pre-signed URLs for file transfers** — list/create/delete go through API; uploads and downloads use pre-signed PUT/GET so bytes go browser↔S3 direct.

**Why not the alternatives (decisions log):**

- **Pure SPA with browser-only state** — rejected. User explicitly wanted "its own database, not just localStorage of whichever browser profile."
- **Tauri/Electron desktop app** — rejected. User said "not an app, a website."
- **Fold backend into telegram-s3 binary** — rejected. CloudShelf is meant to be a *general* S3 client; coupling it to telegram-s3 would limit it to one backend.
- **TanStack Start (SSR)** — rejected. SSR's first-paint win is irrelevant on localhost/LAN, and adds hydration complexity for no UX gain.
- **Local-first sync framework (ElectricSQL/Replicache/Triplit/Yjs/etc.)** — rejected. They exist to solve multi-user concurrent writes via CRDTs. Single-user with last-write-wins doesn't need any of that. S3 itself is always remote, so true offline is moot.
- **TanStack Query IndexedDB persister + outbox** — deferred. Backend lives on localhost/LAN with ~5ms response times; the persister's benefit is invisible at that latency. Trivial to add later (~20 lines) if we ever deploy remotely.

---

## 3. API surface

All under `/api/*`. Request/response shapes typed in `server/types.ts` and
imported by the frontend via the `@server/*` path alias (compile-time only).

### Connections (implemented)

- `GET    /api/connections` → `S3Connection[]`
- `GET    /api/connections/:id` → `S3Connection`
- `POST   /api/connections` → `S3Connection` (validates payload, generates id + timestamps)
- `PATCH  /api/connections/:id` → `S3Connection`
- `DELETE /api/connections/:id` → `{ ok: true }`
- `POST   /api/connections/test` → `{ ok, bucketCount?, error? }` (validate without saving)
- `POST   /api/connections/:id/test` → same (validate a saved one)

### S3 operations (TODO — added per screen)

- `GET  /api/connections/:id/buckets` → bucket list
- `POST /api/connections/:id/buckets` → create bucket
- `DELETE /api/connections/:id/buckets/:bucket` → delete (empty) bucket
- `GET  /api/connections/:id/buckets/:bucket/objects?prefix=&continuationToken=` → page of objects + common prefixes
- `HEAD /api/connections/:id/buckets/:bucket/objects/*` → object metadata
- `DELETE /api/connections/:id/buckets/:bucket/objects/*` → delete object(s)
- `POST /api/connections/:id/buckets/:bucket/copy` → server-side copy (rename/move)
- `POST /api/connections/:id/buckets/:bucket/objects/*/presign-get?expiresIn=` → presigned GET URL
- `POST /api/connections/:id/buckets/:bucket/objects/*/presign-put?contentType=` → presigned PUT URL (single-shot upload)
- `POST /api/connections/:id/buckets/:bucket/multipart/start` → init multipart upload
- `POST /api/connections/:id/buckets/:bucket/multipart/part-url` → presigned URL for one part
- `POST /api/connections/:id/buckets/:bucket/multipart/complete` → finalize
- `POST /api/connections/:id/buckets/:bucket/multipart/abort` → abort

### Per-device niceties (TODO, separate tables)

- `GET/POST/DELETE /api/favorites` — pinned buckets/prefixes
- `GET/POST/DELETE /api/recent` — recently-viewed objects
- `GET/PATCH /api/prefs` — view mode, density, multipart settings, etc.

---

## 4. Schema (SQLite)

Current (in `server/db.ts`):

```sql
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  region TEXT NOT NULL,
  access_key_id TEXT NOT NULL,        -- plaintext, single-user/local-use only
  secret_access_key TEXT NOT NULL,    -- plaintext
  force_path_style INTEGER NOT NULL DEFAULT 1,
  force_ssl INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Planned (added when the corresponding screens land):

```sql
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(connection_id, bucket, prefix)
);

CREATE TABLE recent_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  action TEXT NOT NULL,                 -- 'view' | 'upload' | 'download'
  accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 5. Feature list

### A. Setup & connection
- [x] Setup screen (endpoint, access key, secret, region, path-style, force-SSL toggles)
- [x] "Test connection" via `ListBuckets` before save
- [x] Multiple saved profiles (server-backed)
- [ ] Profiles management screen (list / edit / delete / set default)
- [ ] Connection health indicator in nav (polls a cheap endpoint periodically)

### B. Bucket management
- [ ] List buckets (with creation date)
- [ ] Create bucket (validates per S3 naming rules)
- [ ] Delete empty bucket (confirm modal)
- [ ] Pin favorite buckets
- [ ] Filter bucket list

### C. Object browsing
- [ ] Prefix-based virtual folders (slash-delimited)
- [ ] Breadcrumb nav
- [ ] Sort by name / size / modified
- [ ] Grid + list view toggle (persisted per-device)
- [ ] File-type icons by extension
- [ ] Virtualized list (handles 10k+)
- [ ] Infinite scroll (continuation token)
- [ ] Multi-select (click, shift-range, ⌘/ctrl-toggle, ⌘A)
- [ ] Right-click context menu

### D. Upload
- [ ] Drag-drop anywhere on the file area
- [ ] Click "Upload" → file picker (multi)
- [ ] Folder upload (preserves structure)
- [ ] Auto-multipart above threshold (default 16 MB)
- [ ] Parallel parts (default 4)
- [ ] Per-file progress + queue progress in nav
- [ ] Pause / resume / cancel / retry
- [ ] Resume across page reloads (IndexedDB)
- [ ] Overwrite warning (HEAD probe first)
- [ ] Optimistic placeholder in list

### E. Download
- [ ] Single via presigned GET URL (browser → S3 direct)
- [ ] Open in new tab
- [ ] Bulk download (sequential, progress modal)

### F. Object operations
- [ ] Delete single (optimistic + undo toast)
- [ ] Bulk delete (`DeleteObjects` batch)
- [ ] Rename (COPY + DELETE)
- [ ] Move to another prefix
- [ ] Copy within / across buckets
- [ ] Metadata panel (size, modified, ETag, content-type, user-metadata)

### G. Preview
- [ ] Images, video, audio, PDF, text, code, markdown
- [ ] Fallback "Open in new tab"

### H. Sharing
- [ ] Copy direct URL (where backend allows public GET)
- [ ] Generate presigned URL with expiry input
- [ ] QR code

### I. Search & discovery
- [ ] In-prefix client-side filter
- [ ] Cross-bucket server-side scan
- [ ] Recent uploads view
- [ ] ⌘K command palette

### J. Settings
- [ ] Theme: light / dark / system
- [ ] Default view: grid / list
- [ ] Multipart part size (8 / 16 / 32 / 64 MB)
- [ ] Concurrent uploads (2–8)
- [ ] Manage profiles
- [ ] Reset all local data

### K. Polish
- [ ] Optimistic updates everywhere
- [ ] Undo window for destructive ops
- [ ] Keyboard shortcuts (`/`, `j/k`, `x`, `del`, `r`, `?`)
- [ ] Loading skeletons (not spinners)
- [ ] Empty states with CTAs
- [ ] Error boundaries

---

## 6. Out of scope

These match what telegram-s3 doesn't implement; we hide the UI for them
unless feature-detected later:

- Object ACLs
- Versioning UI
- Lifecycle policies
- Object tags editor
- Server-side encryption settings
- IAM / user management (single-user tool)
- CDN / webhook configuration
- Native mobile app
- Server-side transcoding
- Collaborative real-time updates

---

## 7. Project layout

```
telegram-s3-client/
├── server/                       # Bun + Hono backend
│   ├── index.ts                  # entry; serves /api in dev + /dist in prod
│   ├── db.ts                     # bun:sqlite + schema + CRUD
│   ├── types.ts                  # shared API types (imported by frontend too)
│   ├── lib/
│   │   └── s3.ts                 # createS3Client + probeConnection
│   └── routes/
│       └── connections.ts        # /api/connections handlers
├── src/                          # Vite + React SPA
│   ├── main.tsx
│   ├── vite-env.d.ts
│   ├── styles.css                # Tailwind v4 + theme tokens (oklch)
│   ├── routes/                   # TanStack Router file-based
│   │   ├── __root.tsx            # TooltipProvider + Outlet + Toaster
│   │   ├── index.tsx             # bucket list (currently placeholder)
│   │   └── setup.tsx             # first-run / add-connection form
│   ├── components/
│   │   ├── ui/                   # shadcn primitives (button, input, switch, …)
│   │   ├── pill-nav.tsx          # floating top nav + StatusDot + PillThemeToggle
│   │   ├── form-section.tsx      # FormCard / FormGroup / FormDivider / FormToggleRow
│   │   ├── status-alert.tsx      # success / error / info / warning inline alerts
│   │   ├── password-input.tsx    # eye-toggle, mono
│   │   ├── callout.tsx           # tinted icon+text note
│   │   ├── theme-provider.tsx
│   │   └── theme-toggle.tsx
│   ├── lib/
│   │   ├── utils.ts              # cn() helper
│   │   ├── query.ts              # QueryClient config
│   │   └── api/
│   │       ├── client.ts         # typed fetch wrapper (ApiClientError)
│   │       └── connections.ts    # useConnections / useTestConnection / …
│   ├── stores/
│   │   ├── active-connection.ts  # current connection id (per-device, localStorage)
│   │   ├── prefs.ts              # UI preferences
│   │   ├── selection.ts          # selected object keys (transient)
│   │   └── uploads.ts            # upload queue UI state
│   └── routeTree.gen.ts          # AUTO-generated, gitignored
├── data/                         # runtime: cloudshelf.db (gitignored)
├── index.html
├── vite.config.ts                # proxies /api → :3001
├── tsconfig.json                 # references app + node + server
├── tsconfig.app.json
├── tsconfig.node.json
├── tsconfig.server.json
├── components.json               # shadcn config
└── package.json
```

---

## 8. Dev / build / run

```bash
bun install                # one-time

# Dev (two processes; concurrently runs them in one terminal):
bun run dev                # → API on :3001 + Vite on :5173
# or individually:
bun run dev:server         # Bun --watch server/index.ts  (:3001)
bun run dev:ui             # Vite on :5173, proxies /api → :3001

bun run typecheck          # tsc -b (all projects)
bun run build              # tsc -b && vite build → dist/
bun run start              # NODE_ENV=production bun server/index.ts
                           # → serves SPA from ./dist + /api on :3001
```

**Environment overrides:**
- `PORT` (server) — default 3001
- `CLOUDSHELF_DB` (server) — override SQLite path (default `./data/cloudshelf.db`)
- `CLOUDSHELF_API` (vite) — override proxy target (default `http://localhost:3001`)

---

## 9. Phasing

1. **Phase 0** — ✅ Scaffold (frontend + backend), setup screen end-to-end.
2. **Phase 1** — Bucket list screen + create/delete bucket.
3. **Phase 2** — Object browser (read-only) + virtualized list + breadcrumbs.
4. **Phase 3** — Upload engine (single + multipart via presigned URLs) + drag-drop.
5. **Phase 4** — Download / delete / rename / copy / move + optimistic UI.
6. **Phase 5** — Preview, search, command palette, keyboard shortcuts.
7. **Phase 6** — Settings, profile management, polish, error boundaries.
