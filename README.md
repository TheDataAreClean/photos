# Photography Gallery

A static photography gallery that combines photos from [Glass.photo](https://glass.photo) and local files. Built with [Eleventy](https://www.11ty.dev/). No database, no server — deploys anywhere.

**Features**
- Masonry grid with FLIP animations and per-photo lightbox
- Stack view — one-photo-at-a-time reading mode with swipe, keyboard, and navigation controls
- Shuffle mode — randomises display order, persisted across visits
- Infinite scroll — first 60 photos load instantly, rest fetched on demand
- Per-photo permalink pages with Open Graph tags for sharing
- Every photo has a Markdown sidecar file for editing title, description, tags, and EXIF overrides
- Local photos are auto-renamed to clean date-based filenames on build
- Glass photos get stable, readable URL slugs derived from date + description

---

## Quick start

```bash
npm install
# Edit config.js — set your Glass username, site title, site URL
npm run dev        # build + live reload at http://localhost:3003
```

---

## Adding photos

### Glass photos

Set your Glass username in `config.js`. The build fetches your public posts, caches them for one hour, and auto-creates a sidecar in `glass-sidecars/` for each photo. Run `npm run build:fresh` to force a re-fetch. Open any sidecar to edit metadata — see [Editing photo metadata](#editing-photo-metadata).

### Local photos

Drop image files into `local/`. Supported formats: `.jpg` `.jpeg` `.png` `.webp` `.heic` `.tiff`

On the next build the file is:
1. Auto-renamed to `YYYY-MM-DD-local.ext` using EXIF date
2. A matching sidecar `YYYY-MM-DD-local.md` is auto-created with EXIF values pre-filled
3. An 800px WebP thumbnail is generated for the grid; a 2400px WebP is generated for the lightbox; a watermarked copy is generated for download

If you add a `title` to the sidecar, the file is renamed to `YYYY-MM-DD-local-your-title.ext` on the next build.

---

## Editing photo metadata

Every photo — Glass and local — has a Markdown sidecar file.

```markdown
---
title: "Bougainvillea wall"
tags: [street, mumbai]

overrideExif:
  camera: "Fujifilm X-T50"
  lens: "XF23mmF2 R WR"
  focalLength: "23mm"
  focalLength35: "35mm"
  aperture: "f/2.8"
  shutterSpeed: "1/250s"
  iso: 400

dateTaken: "2026-03-09T08:57:02Z"
---

Write your description here.
It supports multiple paragraphs and line breaks.
```

- **title** — displayed on the card and photo page; also triggers a rename for local files
- **tags** — stored, not yet used in the UI
- **overrideExif** — any field left blank falls back to what Glass or EXIF provides
- **dateTaken** — leave blank to use EXIF or Glass date
- **body** — description shown in the lightbox and on the photo page

Save the file and run `npm run build` — changes appear immediately.

---

## Project structure

```
├── config.js               Site and build configuration
├── .eleventy.js            Eleventy config (filters, pass-through, output)
│
├── _data/
│   ├── photos.js           Data pipeline: fetches Glass + local, writes JSON chunks
│   └── siteConfig.js       Exposes config.site to Eleventy templates
│
├── _includes/
│   └── layouts/
│       └── base.njk        Base HTML layout
│
├── src/
│   ├── index.njk           Gallery index page (masonry grid + lightbox)
│   ├── photos/
│   │   ├── photo.njk       Per-photo permalink pages
│   │   └── photos.11tydata.js  Computed data (OG tags) for photo pages
│   ├── styles/
│   │   ├── base.css           Design tokens and reset
│   │   ├── desk.css           Wood grain background, header, footer, mobile edge fades
│   │   ├── grid.css           Masonry grid layout
│   │   ├── photo-card.css     Card styling, rotation, hover, flip
│   │   ├── lightbox.css       Lightbox modal (desktop + mobile)
│   │   ├── photo-page.css     Individual photo permalink pages
│   │   ├── stack.css          Stack view layout and animations
│   │   └── view-toggle.css    Grid/stack/shuffle toggle widget
│   └── scripts/
│       ├── gallery-core.js    Shared card factory and utilities
│       ├── gallery.js         Grid rendering and infinite scroll
│       ├── lightbox.js        Lightbox viewer and FLIP animation
│       ├── stack.js           Stack view navigation and transitions
│       └── view-toggle.js     View state persistence and toggle wiring
│
├── build/
│   ├── exif.js             EXIF extraction (exifr)
│   ├── merge.js            Deduplication and date sorting
│   ├── sources/
│   │   ├── glass.js        Glass API client, sidecar management
│   │   └── local.js        Local photo processor, auto-rename
│   └── utils/
│       ├── slug.js         Slug generation utilities
│       └── sidecar.js      Shared sidecar read/write helpers
│
├── scripts/
│   ├── rename.js           Master rename (local + glass)
│   ├── rename-local.js     Rename local photos by EXIF date + title
│   ├── rename-glass.js     Rename glass sidecars by title
│   └── sync-glass.js       Standalone Glass API sync
│
├── local/                  Drop local photos here
├── glass-sidecars/         Auto-created Glass photo sidecars (edit freely)
│
└── dist/                   Build output (not committed)
```

---

## Configuration

All options are in `config.js`:

| Key | Description |
|-----|-------------|
| `site.title` | Gallery title shown in the header and browser tab |
| `site.url` | Full deployed URL (e.g. `https://photos.example.com`) — needed for OG image tags |
| `glass.username` | Your Glass username |
| `glass.token` | Optional Glass auth token (set via `GLASS_TOKEN` env var) |
| `glass.maxPhotos` | Maximum number of Glass photos to fetch (default: 500) |
| `local.photosDir` | Path to local photos folder (default: `./local`) |
| `local.thumbWidth` | Grid thumbnail width in pixels (default: 800) |
| `build.cacheTTLMinutes` | How long to cache the Glass API response (default: 60) |

---

## npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build and serve at `localhost:3003` with live reload |
| `npm run build` | Production build |
| `npm run build:fresh` | Force re-fetch Glass API (bypasses 1-hour cache) |
| `npm run sync:glass` | Pull latest Glass data without a full build |
| `npm run rename` | Dry-run rename preview for all photos |
| `npm run rename -- --apply` | Apply renames |
| `npm run rename:local` | Local photos only |
| `npm run rename:glass` | Glass sidecars only |
| `npm run gen:favicon` | Regenerate favicon assets from SVG |

---

## Deployment

`dist/` is a fully static site — deploy it anywhere.

**Netlify / Vercel** — build command `npm run build`, publish directory `dist`.

**GitHub Pages** — a workflow is included at `.github/workflows/`. Push to `main` to deploy.

**Environment variables**

| Variable | Description |
|----------|-------------|
| `GLASS_TOKEN` | Glass API token (optional, improves rate limits) |
| `SITE_URL` | Full deployed URL — required for correct OG image tags |
| `FRESH` | Set to `1` to bypass the Glass cache (`FRESH=1 npm run build`) |
