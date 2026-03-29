# Photography Gallery

A static photography gallery that combines photos from [Glass.photo](https://glass.photo) and local files. Built with [Eleventy](https://www.11ty.dev/). No database, no server — deploys anywhere.

**Features**
- Masonry grid with FLIP animations and per-photo lightbox
- Infinite scroll — first 60 photos load instantly, rest fetched on demand
- Per-photo permalink pages with Open Graph tags for sharing
- Every photo has a Markdown sidecar file for editing title, description, tags, and EXIF overrides
- Local photos are auto-renamed to clean date-based filenames on build
- Glass photos get stable, readable URL slugs derived from date + description

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure (see config.js)
#    Set your Glass username, site title, etc.

# 3. Build and preview
npm run dev        # build + live reload at http://localhost:3000
```

---

## Adding photos

### Glass photos

Set your Glass username in `config.js`. The build fetches your public posts automatically and caches them for one hour. Run `npm run build:fresh` to force a re-fetch.

Each Glass photo gets a Markdown sidecar auto-created in `glass-sidecars/`:

```
glass-sidecars/
  2026-03-14-glass-still.md
  2026-03-09-glass-bougainvillea.md
  ...
```

Open any file to edit it — see [Editing photo metadata](#editing-photo-metadata) below.

### Local photos

Drop image files into `local/`. Supported formats: `.jpg` `.jpeg` `.png` `.webp` `.heic` `.tiff`

On the next build the file is:
1. Auto-renamed to `YYYY-MM-DD-local.ext` using EXIF date
2. A matching sidecar `YYYY-MM-DD-local.md` is auto-created with EXIF values pre-filled
3. An 800px thumbnail is generated for the grid; the original is served in the lightbox

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

- **title** — displayed on the card and photo page; also used to rename local files
- **tags** — available for filtering (feature coming)
- **overrideExif** — any value left blank falls back to what Glass or EXIF provides
- **dateTaken** — leave blank to use EXIF or Glass date
- **body** — description text shown in the lightbox and on the photo page

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
│   │   ├── base.css        CSS variables and resets
│   │   ├── desk.css        Wood grain background, header, footer
│   │   ├── grid.css        Masonry grid layout
│   │   ├── photo-card.css  Card styling, rotation, hover
│   │   ├── lightbox.css    Lightbox modal (desktop + mobile)
│   │   └── photo-page.css  Individual photo permalink pages
│   └── scripts/
│       ├── gallery.js      Grid rendering and infinite scroll
│       └── lightbox.js     Lightbox viewer and FLIP animation
│
├── build/
│   ├── exif.js             EXIF extraction (exifr)
│   ├── merge.js            Deduplication and date sorting
│   ├── sources/
│   │   ├── glass.js        Glass API client, sidecar management
│   │   └── local.js        Local photo processor, auto-rename
│   └── utils/
│       └── slug.js         Slug generation utilities
│
├── scripts/
│   └── rename-local.js     Preview local renames before building
│
├── local/                  Drop local photos here
├── glass-sidecars/         Auto-created Glass photo sidecars (edit freely)
│
└── dist/                   Build output (not committed)
    ├── index.html
    ├── data/               Paginated JSON chunks for infinite scroll
    ├── photos/             Local photo assets + per-photo HTML pages
    ├── styles/
    └── scripts/
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
| `npm run dev` | Build and serve at `localhost:3000` with live reload |
| `npm run build` | Production build |
| `npm run build:fresh` | Force re-fetch Glass API (bypasses cache) |
| `npm run rename` | Preview auto-renames of local photos (dry run) |
| `npm run rename -- --apply` | Apply renames |

---

## Deployment

The `dist/` folder is a fully static site — deploy it anywhere.

**Netlify / Vercel**
Connect the repo and set the build command to `npm run build` with publish directory `dist`. Set `GLASS_TOKEN` and `SITE_URL` as environment variables if needed.

**GitHub Pages**
Use a GitHub Action to run the build and push `dist/` to the `gh-pages` branch.

**Anywhere else**
Upload the contents of `dist/` to any static file host.

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `GLASS_TOKEN` | Glass API token (optional, improves rate limits) |
| `SITE_URL` | Full deployed URL for Open Graph image tags |
| `FRESH` | Set to `1` to bypass the Glass cache (`FRESH=1 npm run build`) |
