# Memories on EmDash (experiment)

The gallery rebuilt on [EmDash](https://github.com/emdash-cms/emdash) 1.2 — an Astro CMS
with an admin UI at `/_emdash/admin`. Runs locally on SQLite + local file storage.
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
To start over, stop the server and delete `data.db*` and `uploads/`.

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

Field values are stored as entered — there's no live EXIF fallback any more; the
importer copies the sidecar values, which the Eleventy build had already filled in.

## Not ported yet

- Masonry layout, lightbox, stack view, shuffle, card flip, series overlay (pages are plain server-rendered HTML)
- Monthly OG image generation
- New photos: uploading in the admin works, but nothing reads EXIF from the upload or
  strips GPS from it — the importer is the only path that does that today
- Deployment: EmDash runs as a server (Cloudflare Workers + D1 + R2, or Node), not GitHub Pages.
  The Cloudflare variant swaps the adapter and the `database`/`storage` lines in
  `astro.config.mjs` (see EmDash's `templates/portfolio-cloudflare`).
