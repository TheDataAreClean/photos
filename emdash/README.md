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

## Design

`public/styles`, `public/scripts` and `public/images` are copies of the Eleventy site's
`src/` folders, unchanged. The Astro pages (`src/pages`, `src/layouts/Base.astro`) emit the
same HTML as the `.njk` templates, and `src/lib/gallery.ts` builds the same photo objects
the scripts read, including `/data/photos-N.json` for infinite scroll. Each photo has three
files: display (clean), download (watermarked) and an 800px thumbnail, as before.

## Deploy

`.github/workflows/emdash-deploy.yml` builds and deploys to Cloudflare Workers (manual run,
plus monthly for the OG image). It does nothing until the repo variable `EMDASH_DEPLOY` is
`true` and the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist; set
`EMDASH_SITE_URL` to the live URL so the OG image picks from the live photos.
The first deploy creates the `memories` D1 database and `memories-media` R2 bucket. That
bucket holds public media only; originals stay in the private `photos` bucket.
The Worker is about 4.7 MB gzipped, over the Workers Free limit of 3 MB, so it needs
Workers Paid. After the first deploy, sign in at `/_emdash/admin`, create an API token,
and import: `EMDASH_TOKEN=ec_pat_... npm run import -- --url <site>`.

Monthly OG image: `scripts/gen-og-image.mjs` runs the Eleventy build's `build/og-image.js`
against the live photos before `astro build`. EmDash's sitemaps are switched off in
`src/middleware.ts`, since the site is unindexed.

## Not ported yet

- Retiring Sveltia, the launchd watcher, `publish-local` and the sidecar pipeline (after cut-over)
