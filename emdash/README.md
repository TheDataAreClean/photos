# Memories on EmDash (experiment)

The gallery rebuilt on [EmDash](https://github.com/emdash-cms/emdash) 1.2 — an Astro CMS
with an admin UI at `/_emdash/admin`. Runs on Cloudflare Workers with D1 (database) and
R2 (media); `npm run dev` runs the same bindings locally, with state in `.wrangler/`.
The Eleventy site in the repo root is untouched and still what deploys.

## Run it

```sh
cd emdash
npm install
npm run dev                 # http://localhost:4321
```

Open http://localhost:4321/_emdash/admin and finish setup (or, locally only,
http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin).
The schema in `seed/seed.json` is applied on the first request.

## Import the existing gallery

With the dev server running, in a second terminal:

```sh
npm run import                          # originals from ../local
npm run import -- --local <dir>         # originals somewhere else
npm run import -- --placeholder         # no originals: grey stand-ins
```

Reads `../sidecars/*.md` and `../series/*.md`. Each original is resized to 2400px,
watermarked like `build/watermark.js`, and re-encoded as JPEG, so no EXIF or GPS
reaches EmDash's media library. Re-running skips photos and series that already exist.
To start over, stop the server and delete `.wrangler/state`.

## What maps to what

| Eleventy site | EmDash |
|---|---|
| `sidecars/<id>.md` | `photos` entry, slug = `<id>` (same `/photos/<id>/` URL) |
| sidecar `title`, body | `title`, `caption` (rich text) |
| EXIF override fields | `date_taken`, `camera`, `lens`, `focal_length`, `focal_length_35`, `aperture`, `shutter_speed`, `iso` |
| sidecar `tags` | `tag` taxonomy |
| `series/<slug>.md` | `series` entry with ordered `photos` and `cover` references |
| `local/` original | watermarked JPEG in the media library |
| `/feed.xml` | `/feed.xml` (Atom, latest 15) |

Field values are stored as entered; the importer copies the sidecar values, which the
Eleventy build had already filled in.

## Adding a photo in the admin

The `Photo` field uses the `memories:photo-upload` widget from `plugins/memories`
(a native EmDash plugin). Picking or dropping a photo:

1. reads its EXIF in the browser (never location),
2. redraws it through a canvas at ≤2400px wide, which drops every metadata block (GPS included),
3. burns in the watermark exactly like `build/watermark.js` (18% width, bottom-right, 1.8% margin),
4. uploads that JPEG. The original never leaves the browser.

On save, blank EXIF fields (`date_taken`, `camera`, … `iso`) fill from the photo's EXIF,
same rule as the old sidecars: clear a field to get the EXIF value back; `0` counts as a value.
The slug follows `YYYY-MM-DD-title` while it's auto-generated; typing your own slug stops that.
HEIC only decodes in Safari; elsewhere export a JPEG first.

## Not ported yet

- Masonry layout, lightbox, stack view, shuffle, card flip, series overlay (pages are plain server-rendered HTML)
- Monthly OG image generation
- Deployment: `npm run deploy` needs the `memories` D1 database and the `memories-media`
  R2 bucket created first (`wrangler.jsonc`). That bucket is public media only; originals
  stay in the private `photos` bucket, which the Worker never binds.
