# CloudShelf

A self-hosted, single-user web app for managing S3-compatible storage —
buckets, folders, uploads, downloads, previews, presigned links — for any
S3 endpoint (MinIO, R2, AWS, [telegram-s3](https://github.com/hoangvu12/telegram-s3),
…).

Live demo: <https://files.nguyenvu.dev>

> ⚠️ **Single-user, no auth.** Credentials sit in plaintext SQLite. Run it
> on a LAN, on `localhost`, or behind your own auth proxy. Don't expose
> the raw service to the public internet.

## What it does

- **Multi-connection** — keep profiles for several S3 endpoints, switch
  between them from the header.
- **Browse buckets** like a file manager: virtual folders, breadcrumbs,
  grid or list view, search, sort.
- **Upload** — drag-and-drop, parallel uploads, real progress.
  Multipart for big files. Bytes go browser → S3 directly via presigned
  URLs (the server never proxies the payload), so progress is honest and
  bandwidth isn't doubled.
- **Previews** — images, video, audio, PDFs, and syntax-highlighted text
  via Shiki without downloading the whole object.
- **Presigned share links** with a configurable TTL.
- **Light / dark / system theme**, rounded shadcn UI, keyboard-friendly.

## Stack

- **Frontend** — Vite 6 + React 19 + TypeScript (strict), TanStack
  Router (file-based) + TanStack Query 5, Tailwind v4, shadcn/ui,
  Zustand, Shiki.
- **Backend** — Bun + Hono on `:3001`. `bun:sqlite` for the connection
  store. `@aws-sdk/client-s3` runs server-only and only mints presigns +
  handles control-plane calls.
- **One process in prod** — `bun run start` serves `/api/*` and the
  built SPA on the same port.

## Quick start (local)

```bash
bun install
bun run dev          # API :3001 + Vite :5173 (concurrently)
```

Open <http://localhost:5173>, click **Add connection**, point it at any
S3-compatible endpoint. CloudShelf probes the credentials before
saving.

### Other scripts

```bash
bun run dev:server   # bun --watch server/index.ts        (:3001 only)
bun run dev:ui       # vite                                (:5173, proxies /api)
bun run typecheck    # tsc -b
bun run build        # tsc -b && vite build → dist/
bun run start        # NODE_ENV=production bun server/index.ts
                     #   → serves SPA from ./dist + /api on $PORT
```

### Environment variables

| Var | Default | What it does |
|---|---|---|
| `PORT` | `3001` | Server port (API + SPA in prod) |
| `CLOUDSHELF_DB` | `./data/cloudshelf.db` | SQLite file location — mount a volume here in prod |
| `CLOUDSHELF_API` | `http://localhost:3001` | Vite dev proxy target |
| `NODE_ENV` | — | Set to `production` to enable static SPA serving |

## Deploy

### Docker

```bash
docker build -t cloudshelf .
docker run -d \
  --name cloudshelf \
  -p 3001:3001 \
  -v cloudshelf-data:/app/data \
  cloudshelf
```

Mount `/app/data` to a volume — that's where `cloudshelf.db` lives.

### Easypanel

1. Create an **App** service from this GitHub repo.
2. Build type: **Dockerfile**.
3. Add a **volume mount**: name `cloudshelf-data`, path `/app/data`.
4. Add a **domain** pointing at internal port `3001` (HTTPS on).

The included `Dockerfile` is the multi-stage build Easypanel will pick
up automatically.

### Behind a reverse proxy

Front it with Caddy / nginx / Cloudflare / Traefik for TLS and (if you
want it on the public internet) an auth layer like Cloudflare Access,
basic auth, or Authelia.

## Connecting to telegram-s3

CloudShelf was built alongside [telegram-s3](https://github.com/hoangvu12/telegram-s3)
but isn't coupled to it. To connect:

| Field | Value |
|---|---|
| Endpoint | `http://localhost:9000` (or your telegram-s3 URL) |
| Region | `us-east-1` (anything works — required by SDK) |
| Access key | telegram-s3 access key |
| Secret key | telegram-s3 secret key |
| Force path-style | ✅ on |

The same setup works for **MinIO**, **Cloudflare R2** (use `<account>.r2.cloudflarestorage.com`),
**AWS S3** (leave endpoint blank), **Backblaze B2 S3**, **Wasabi**, etc.

## Project layout

```
server/                     # Bun + Hono API
├── index.ts                # entry; /api/* + serves /dist in prod
├── db.ts                   # bun:sqlite + schema + queries
├── types.ts                # shared with frontend via @server/*
├── lib/s3.ts               # createS3Client + probeConnection
└── routes/connections.ts

src/                        # Vite SPA — browser only, never imports AWS SDK
├── main.tsx
├── styles.css              # Tailwind v4 + oklch theme tokens
├── routes/                 # TanStack Router (file-based)
│   ├── __root.tsx
│   ├── index.tsx
│   ├── setup.tsx
│   ├── settings.tsx
│   └── buckets.$bucketName.$.tsx
├── components/
│   ├── ui/                 # shadcn primitives (rounded-2xl retheme)
│   ├── pill-nav.tsx
│   ├── form-section.tsx
│   └── …
├── lib/
│   ├── api/                # apiFetch + React Query hooks
│   ├── query.ts
│   └── utils.ts
└── stores/                 # Zustand
    ├── active-connection.ts
    ├── prefs.ts
    ├── selection.ts
    └── uploads.ts

data/                       # cloudshelf.db lives here (gitignored)
Dockerfile                  # multi-stage build for prod
```

## Adding things

**Route** — drop a `.tsx` in `src/routes/` exporting a `Route` from
`createFileRoute(...)`. `src/routeTree.gen.ts` regenerates on save.

**API endpoint** — handler in `server/routes/<resource>.ts`, mount in
`server/index.ts`, types in `server/types.ts`, React Query hooks in
`src/lib/api/<resource>.ts`.

**shadcn component** —
```bash
bunx --bun shadcn@latest add <component> --yes
```
Note: primitives in `src/components/ui/` are themed (rounded-2xl, h-12
inputs, `subtle`/`pill` Button variants). Re-adding a primitive will
overwrite the retheme — diff before committing. On Windows the CLI
occasionally writes literal `@/...` paths; if an `@` folder appears at
the repo root, move its contents into `src/` and delete it.

## Security notes

- **No auth.** Don't expose to the public internet without a layer in
  front (Cloudflare Access, basic auth, Authelia, …).
- Credentials are plaintext in `data/cloudshelf.db` — keep that file
  out of backups/syncs you don't trust. `data/` is gitignored.
- The browser never sees S3 credentials. Presigned URLs are minted with
  short TTLs and scoped to a single operation.

## License

MIT
