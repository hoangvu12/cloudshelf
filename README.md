# CloudShelf

A self-hosted, single-user web app for managing S3-compatible storage —
optimized for [telegram-s3](../telegram-s3) but works with any S3 endpoint
(MinIO, R2, AWS, …).

See [PLAN.md](./PLAN.md) for the full architecture, decisions log, and
feature roadmap. See [PROMPTS.md](./PROMPTS.md) for the UI-generation
prompts used to design each screen.

## How it's shaped

Full-stack web app:

- **Backend** — Bun + Hono server on `:3001`. Owns the SQLite DB
  (`./data/cloudshelf.db`) where connection profiles live. Holds the AWS
  SDK; the browser never touches S3 directly.
- **Frontend** — Vite + React 19 SPA on `:5173` in dev. Talks only to
  `/api/*` via a typed fetch wrapper + TanStack Query hooks.
- **In prod** — `bun run build` outputs `dist/`. `bun run start` boots one
  Bun process that serves `/api/*` *and* the static SPA on the same port.

Credentials sit plaintext in SQLite — the app is designed for **local /
LAN use only**. Don't expose to the public internet.

## Stack at a glance

- Vite 6 + React 19 + TypeScript 5 (strict, project references)
- TanStack Router (file-based) + TanStack Query 5
- Tailwind v4 + shadcn/ui (`new-york` style, neutral baseColor)
- Zustand for per-device UI state
- Bun + Hono + `bun:sqlite` backend
- `@aws-sdk/client-s3` runs on the server only
- next-themes for light/dark/system

## Prerequisites

- Bun 1.3+
- An S3-compatible endpoint (telegram-s3 defaults to `http://localhost:9000`)

## Run

```bash
bun install

# Dev — two processes (concurrently runs them in one terminal):
bun run dev                # → API :3001 + Vite :5173
# or split:
bun run dev:server         # Bun --watch server/index.ts  (:3001)
bun run dev:ui             # Vite :5173, proxies /api → :3001

# Other:
bun run typecheck          # tsc -b (all projects)
bun run build              # tsc -b && vite build → dist/
bun run start              # NODE_ENV=production bun server/index.ts
                           # → serves SPA from ./dist + /api on :3001
```

### Environment overrides

| Var | Default | What it does |
|---|---|---|
| `PORT` | `3001` | API server port |
| `CLOUDSHELF_DB` | `./data/cloudshelf.db` | SQLite file location |
| `CLOUDSHELF_API` | `http://localhost:3001` | Vite dev proxy target |

## Project layout

```
server/                  # Bun + Hono API
├── index.ts             # entry; /api/* + serves /dist in prod
├── db.ts                # bun:sqlite + schema + queries
├── types.ts             # API types shared with frontend (via @server/*)
├── lib/s3.ts            # createS3Client + probeConnection
└── routes/connections.ts

src/                     # Vite SPA (browser-only; no AWS SDK imports)
├── main.tsx
├── styles.css           # Tailwind v4 + oklch theme tokens
├── routes/              # TanStack Router file-based
│   ├── __root.tsx
│   ├── index.tsx        # bucket list (placeholder)
│   └── setup.tsx        # add-connection form
├── components/
│   ├── ui/              # shadcn primitives (retheme: rounded-2xl, h-12 inputs)
│   ├── pill-nav.tsx     # floating top nav + StatusDot + PillThemeToggle
│   ├── form-section.tsx # FormCard / FormGroup / FormDivider / FormToggleRow
│   ├── status-alert.tsx # success / error / info / warning
│   ├── password-input.tsx
│   ├── callout.tsx
│   └── theme-{provider,toggle}.tsx
├── lib/
│   ├── utils.ts         # cn()
│   ├── query.ts         # QueryClient
│   └── api/
│       ├── client.ts    # apiFetch + ApiClientError
│       └── connections.ts # useConnections / useTestConnection / …
└── stores/              # Zustand
    ├── active-connection.ts
    ├── prefs.ts
    ├── selection.ts
    └── uploads.ts

data/                    # runtime: cloudshelf.db (gitignored)
```

## Adding a shadcn component

```bash
bunx --bun shadcn@latest add <component> --yes
```

> Heads-up: on Windows the CLI sometimes writes literal `@/...` paths
> instead of resolving the alias. If you see an `@` folder appear at
> the repo root after running `add`, move its contents into `src/` and
> delete the `@` folder. (Known shadcn issue.)
>
> Also — primitives in `src/components/ui/` are retheme'd (rounded-2xl,
> h-12 inputs, neutral primary, `subtle`/`pill` variants on Button). If
> you re-add a primitive it'll overwrite the retheme. Diff before
> committing.

## Adding a route

Drop a `.tsx` in `src/routes/` exporting a `Route` via `createFileRoute(...)`.
The router plugin regenerates `src/routeTree.gen.ts` on save.

## Adding an API endpoint

1. Add the handler in `server/routes/<resource>.ts` (or create a new file).
2. Mount it in `server/index.ts` with `app.route(...)`.
3. Add request/response types to `server/types.ts`.
4. Add React Query hooks in `src/lib/api/<resource>.ts`.

## Working from PROMPTS.md

1. Pick a screen from `PROMPTS.md`.
2. Paste the prompt into the UI chatbot.
3. Port the generated HTML into a React route in `src/routes/` — reuse
   the shared components in `src/components/` (`FormCard`, `PillNav`,
   `StatusAlert`, …) so every screen inherits the same look.
4. Wire it to real API hooks in `src/lib/api/`; replace hardcoded sample
   data and JS-toggled demo states.

## Notes

- No auth. Don't expose to the public internet.
- No eslint config / tests yet (planned).
- Credentials are stored plaintext in `data/cloudshelf.db` — keep that
  file out of backups/syncs you don't trust. `data/` is gitignored.
