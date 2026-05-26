# UI Generation Prompts

Prompts for a UI-generating chatbot. Each prompt is self-contained
(HTML + CSS + JS + Tailwind output). Paste them one at a time.

---

## 0. Output rules (paste this BEFORE every other prompt as preamble)

```
Output a single self-contained HTML file using Tailwind via CDN and vanilla JS for interactivity. Ship both light and dark mode with a toggle. Use inline SVG icons (no external image URLs). For thumbnails or media placeholders, use CSS gradients/patterns. Make the design polished, modern, and opinionated — feel free to make every layout, spacing, color, and typography decision yourself. Use realistic sample content, not lorem ipsum.

App name: CloudShelf. It's a personal file manager for S3-compatible storage (telegram-s3, MinIO, R2, AWS S3, etc.).
```

---

## 1. Setup / First-run screen

```
[paste output rules here]

Build a first-run screen for connecting to an S3 endpoint.

What it captures:
- Profile name (e.g., "My telegram-s3")
- Endpoint URL (default suggestion: http://localhost:9000)
- Access key ID
- Secret access key (with show/hide)
- Region (default us-east-1)
- Path-style addressing toggle (on by default)
- Force SSL toggle (off by default)
- A "Use telegram-s3 default" shortcut that fills in localhost:9000

Behavior:
- A primary "Test connection" action that shows three possible result states (build all three, toggleable via a JS demo control): idle, success ("Connected — found 3 buckets"), failure ("Could not connect — check endpoint and credentials").
- A subtle reassurance that credentials are stored locally in the browser and never sent anywhere else.

Include the theme toggle somewhere on the page.
```

---

## 2. Bucket list (home)

```
[paste output rules here]

Build the home screen — a list of S3 buckets the user has access to.

What's on it:
- A way to navigate between sections: All buckets (current), Recent uploads, Shared links, Settings.
- A profile switcher showing the current connection (e.g., "telegram-s3") with the ability to switch.
- A connection-status indicator (green = connected, with latency).
- A global search affordance with a ⌘K shortcut.
- An upload queue indicator that shows a count badge when uploads are active (e.g., "2").
- The bucket list itself, showing for each bucket: name, object count, total size, created date, and the ability to pin favorites (pinned ones float to the top).
- A "New bucket" primary action.
- Toolbar with view-mode toggle (list/grid), sort, and filter.
- Per-row context menu (more-actions).
- An empty state for "no buckets yet" (build this and toggle it via a JS demo control).

Sample data: 7 buckets with realistic names — photos, backups, static-assets, documents, videos-2025, personal-archive, scratch. Two of them ("photos", "backups") are pinned. Realistic varied sizes and dates.
```

---

## 3. Object browser (main file manager)

```
[paste output rules here]

Build the file browser — the most-used screen. It shows files and folders inside a bucket, where folders are virtual (prefix-based, slash-delimited).

What's on it:
- Breadcrumb navigation showing the current path (e.g., photos / 2025 / vacation), with clickable segments and a way to go up one level.
- A search affordance scoped to the current location.
- Actions: Upload, New folder, view toggle (list/grid), sort, item count + total size summary.
- File/folder list. Each entry shows: name, size (blank for folders), modified time, type (extension or "Folder"), and a per-row context menu on hover.
- Multi-select with checkboxes. When items are selected, the action bar morphs into a selection toolbar with: Download, Copy link, Move, Rename, Delete (destructive), and a "Clear" option. Show a "3 selected" state with three rows actively selected.
- Right-click context menu with: Download, Open in new tab, Copy link, Rename, Move, Copy to..., Delete (separated).
- Drag-and-drop overlay state — when files are dragged from the OS, the list area highlights with a "Drop files here to upload" indicator. Build this state and toggle via a JS demo control.

Sample data: a mix of ~15 folders and files with varied types — image (JPEG), video (MP4), audio (WAV), document (PDF), markdown, archive (ZIP), plus a couple of folders. Realistic names, sizes, and modified times.

Use distinct icons per file type (image, video, audio, document, archive, code, folder, generic file).
```

---

## 4. Upload queue panel

```
[paste output rules here]

Build a floating upload queue panel that appears while uploads are in progress.

What it shows:
- A header summarizing overall state (e.g., "3 of 7 complete · 2 uploading").
- Controls to minimize and close the panel.
- A list of upload items, each showing the filename, destination path, and a per-item state.

Build all five possible item states (one panel showing all of them at once):
- Uploading — with progress, transfer speed, ETA, and pause + cancel controls. Include one large file (e.g., "vacation-raw-footage.mov · 2.4 GB" at "47% · 1.13 GB of 2.4 GB · 18.6 MB/s · 1m 12s left") to show how big files look.
- Queued — waiting, with cancel.
- Paused — with resume.
- Completed — with copy-link shortcut.
- Failed — with reason ("Network error") and retry.

Footer actions: clear completed, pause all, cancel all.

Also build a MINIMIZED variant — a compact summary bar ("Uploading 2 of 7 — 47%") with overall progress and an expand control. Both variants in the same file, toggleable via a JS demo control.

Behind the panel, suggest a dimmed file browser silhouette so the panel has visual context.
```

---

## 5. File preview modal

```
[paste output rules here]

Build a file preview overlay that opens when a user clicks a file.

What's on it:
- The filename, type, and size.
- Navigation between files in the current view (previous / next with a counter like "12 of 247").
- Actions: Download, Copy link, Open in new tab, more-actions, Close.
- A keyboard hint somewhere ("← → navigate · I info · D download · Esc close").

A toggleable "Details" panel showing:
- Type, size, modified, created, ETag (copyable), content-type, full path.
- Custom metadata (a few sample key-value rows like "author: hoangvu, camera: sony-a7iv").
- Public link section with the URL, a copy action, and a small QR code (use a CSS-generated placeholder pattern, not an external service).

Build four preview variants for different file types, switchable via tabs at the top of the demo so reviewers can compare:
- Image (use a warm CSS gradient as the "photo")
- Video player with custom controls (play/pause, scrubber, time "1:24 / 3:47", volume, fullscreen)
- Code / text — show a realistic JSON config snippet with line numbers and pseudo syntax highlighting (static colored spans are fine)
- Unsupported fallback — file icon + "Preview not available" + Download / Open in new tab actions
```

---

## 6. Command palette (⌘K)

```
[paste output rules here]

Build a command palette overlay that opens with ⌘K.

What it does:
- A single search input that filters across multiple kinds of results.
- Results grouped by category. Build these groups with sample entries:

  Actions: Upload files (⌘U), Create new bucket, Toggle theme.

  Buckets: photos, backups, static-assets.

  Files (each with its location shown alongside):
    - IMG_0247.jpg — photos/2025/vacation
    - itinerary.pdf — photos/2025/vacation
    - sunset-timelapse.mp4 — photos/2025/vacation
    - backup-archive.zip — backups/weekly

  Recent: Settings, photos / 2024 / october.

- Show one row in the highlighted/active state.
- Keyboard hints in a footer: ↑↓ navigate · ↵ select · Esc close.

Behind the palette, suggest a dimmed app silhouette to give it context.
```

---

## 7. Settings page

```
[paste output rules here]

Build a settings page covering:

APPEARANCE
- Theme: Light / Dark / System
- Default view: List / Grid
- Row density: Comfortable / Compact

UPLOADS
- Multipart part size (8 / 16 / 32 / 64 MB)
- Concurrent uploads (2–8, default 4)
- Concurrent parts per upload (2–8, default 4)
- Overwrite warning toggle (on)
- Resume uploads on reload toggle (on)

PROFILES
- A list of saved S3 endpoint profiles, each showing name, endpoint URL, and a status (Active / Saved).
- Per-profile edit and delete (delete is destructive).
- "Add profile" action.
- 3 sample profiles: "telegram-s3 (local)" active, "MinIO dev", "Cloudflare R2".

KEYBOARD
- A reference of all shortcuts in a clean table: Search (⌘K), Upload (⌘U), New bucket (⌘⇧N), Delete (⌫), Select all (⌘A), Navigate up/down (J/K), Toggle preview (Space), and ~5 more reasonable ones.

ABOUT
- App name + version ("CloudShelf v0.1.0")
- Backend health summary (status, endpoint, latency, last checked)
- Docs / GitHub / Report issue links
- Danger zone: "Reset all local data" (destructive)

Provide some way to navigate between these sections within the page.
```

---

## 8. Modals (create bucket, delete confirm, rename)

```
[paste output rules here]

Build three dialogs in one HTML file, toggleable via trigger buttons.

CREATE BUCKET
- Captures a bucket name.
- Validation hint that shows in real time. Build three states (toggleable via JS demo control): empty (hidden), invalid ("Names cannot contain uppercase letters"), valid ("Available").
- Primary action: Create bucket. Cancel option.

DELETE CONFIRMATION
- Scenario: deleting 12 items.
- Make it clear this is destructive and irreversible.
- Show a preview of the first few items being deleted (with a "+ N more" indicator if applicable).
- Primary action: Delete 12 items (destructive). Cancel option.

RENAME
- Show the current full path in muted text (e.g., photos/2025/vacation/IMG_0247.jpg).
- An input pre-filled with the current name (IMG_0247.jpg), with the basename portion visually selected so the extension is preserved by default.
- A note that rename = copy + delete behind the scenes.
- Primary action: Rename. Cancel option.

Each dialog should hint at Esc-to-close in small text somewhere.
```

---

## 9. Empty states & skeletons showcase

```
[paste output rules here]

Build a single showcase page that demonstrates empty states and loading skeletons side by side, each clearly labeled.

EMPTY STATES (build all six):
1. No buckets yet — encourage creating the first one.
2. Empty bucket — encourage uploading the first files.
3. Empty search results — for a search like "invoice" that returned nothing.
4. No recent uploads.
5. Connection lost — couldn't reach the S3 endpoint, offer retry and a way to check settings.
6. No profiles configured — encourage adding one.

SKELETONS (build all four):
1. Bucket list — rows of placeholder content matching the bucket list shape.
2. File grid — grid of placeholder tiles.
3. File list — rows of placeholder content matching the file browser table.
4. File preview loading — a large media placeholder.

Skeletons should animate (shimmer or pulse).
```

---

## Recommended generation order

1. Setup screen (#1)
2. Bucket list (#2)
3. Object browser (#3)
4. Upload queue (#4)
5. File preview (#5)
6. Command palette (#6)
7. Settings (#7)
8. Modals (#8)
9. Empty / skeleton showcase (#9)

Generate the first two, pick the visual direction you like, then for later screens add a line at the bottom: "Match the visual language (colors, type, spacing, components) of the previous screen." Otherwise each screen will reinvent the look.

---

## Tips for iterating

- If output feels generic, reference a vibe: "Inspired by Linear / Vercel / Raycast / Cloudflare R2."
- If output feels busy, ask for "less visual noise, more whitespace."
- If you want a different feel, describe it in mood terms ("warmer, more playful" / "denser, more pro-tool") rather than prescribing layout.
- For consistency across screens, paste a small screenshot or description of an earlier output and ask the model to match it.
