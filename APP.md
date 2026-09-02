# APP.md — Memories Gallery

Architecture reference. Factual, no opinion. See [CLAUDE.md](CLAUDE.md) for operating instructions.

---

## Architecture at a glance

```
R2 bucket ─→ local/ ┐
                     ├─→ _data/photos.js ──→ Eleventy build ──→ dist/ ──→ GitHub Pages
            series/ ─┘        │       ↑
                     │
                     ├─→ dist/photos/  (resized + watermarked images)
                     ├─→ dist/data/    (paginated JSON chunks)
                     └─→ sidecars/     (one .md per photo, auto-created — tracked in git)
```

`sidecars/` is the home for every photo's caption/EXIF-override file. `local/` holds the actual image files.

`local/` originals are gitignored (raw EXIF/GPS) and a fresh CI checkout never has them — a private Cloudflare R2 bucket is the backup and the thing CI actually builds from. `downloadMissing()` pulls anything the checkout is missing into `local/` before `processLocal()` runs; `npm run sync:r2` pushes new originals from your machine up to the bucket. Both directions no-op silently when R2 env vars aren't set, so local dev without R2 configured is unaffected.

Since Glass retired, R2 is the *sole* source of originals for CI — there is no fallback. A misconfigured bucket (wrong name, wrong token scope, a rotated/expired credential) doesn't fail the build; `downloadMissing()`'s error is caught and just logged as a warning (`_data/photos.js`), so CI happily builds and deploys an empty gallery. Local (`R2_*` env vars) and CI (`BUCKET_NAME`/`ENDPOINT_URL`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` repo secrets) must reference the *same* bucket and token — see the R2 entry in [CLAUDE.md](CLAUDE.md)'s Common traps for the specific failure modes this can produce.

Eleventy is the only build step. `_data/photos.js` runs first and produces both the photo array (consumed by templates) and all side-effect outputs (images, JSON, sidecars) before any HTML is generated.

---

## Key directories

| Path | Responsibility |
|---|---|
| `config.js` | Single source of truth for site + build configuration |
| `.eleventy.js` | Eleventy config: filters, passthrough copies, output dir |
| `_data/photos.js` | Data pipeline entry point |
| `_data/siteConfig.js` | Exposes `config.site` to Nunjucks templates |
| `_data/series.js` | Exposes `loadSeries()` map (slug → series meta) to templates |
| `_data/seriesArray.js` | Same data as `series.js`, as an array — for iteration in templates |
| `_includes/layouts/base.njk` | HTML shell: `<head>`, CSS (critical sync + deferred async), OG tags, feed autodiscovery |
| `src/index.njk` | Gallery index — masonry grid, infinite scroll, lightbox, stack view |
| `src/feed.njk` | Atom feed → `dist/feed.xml` |
| `src/photos/photo.njk` | Per-photo permalink pages (Eleventy pagination, size: 1) |
| `src/series/series.njk` | Per-series permalink pages + series overlay markup |
| `src/scripts/series-overlay.js` | Full-screen series overlay: thumbnail strip, prev/next, counter |
| `src/styles/base.css` | Design tokens — single source of truth for all CSS custom properties |
| `src/styles/series.css` | Folder card (masonry) + series overlay styles |
| `series/*.md` | One file per series — title, description, cover photo, ordered photo list |
| `build/series.js` | `loadSeries()` — parses `series/*.md` into a slug → meta map |
| `build/sources/local.js` | Photo processor: auto-rename, EXIF, sharp resize, watermark, sidecar create/merge |
| `build/sources/r2.js` | R2 backup: `downloadMissing()` (bucket → `local/`, CI build step) and `uploadNew()` (`local/` → bucket, backup step) |
| `build/merge.js` | Dedup by id (last writer wins) + date sort |
| `build/og-image.js` | Monthly OG image generation via `@napi-rs/canvas` |
| `build/watermark.js` | Watermark compositing via sharp (resize result cached per target size) |
| `build/gen-watermark.js` | Generates `build/assets/watermark.png` (handle text in Schoolbell) consumed by `watermark.js`; run manually or auto-invoked on first build if the PNG is missing. Reads the handle from `config.site.handle` |
| `scripts/sync-r2.js` | Standalone R2 backup — uploads new `local/` originals to the bucket |
| `scripts/publish-local.js` | Backs up new `local/` originals to R2, then commits + pushes `sidecars/` if changed — the push triggers CI build/deploy |
| `scripts/rename-photo.js` | Renames one photo's image + sidecar + any `series/*.md` reference together — the only safe way to change a live slug |
| `test/*.test.js` | `node --test` unit tests for pure logic: slug generation, sidecar `ov()`/embed-stripping, EXIF backfill. No framework — Node's built-in test runner |

---

## Data pipeline

`_data/photos.js` returns the merged photo array and has these side effects (all before Eleventy renders HTML):

1. Downloads any originals missing from `local/` (bucket has them, checkout doesn't) from the R2 backup — no-op if R2 env vars aren't set
2. Processes photos: auto-rename, EXIF extract, sharp resize, watermark, sidecar create/merge (creates a sidecar stub in `sidecars/` for any new photo)
3. Loads `series/*.md` via `loadSeries()` into a slug → meta map
4. Dedups by id (last writer wins) and sorts newest-first by `dateTaken`
5. Applies series membership from `series/*.md` to each photo (`series`, `seriesOrder`, `seriesTitle`, `seriesCount`) — overrides any `series`/`seriesOrder` set in sidecars
6. Writes paginated JSON chunks to `dist/data/photos-N.json` (60 photos each)
7. Prunes stale image files from `dist/photos/` and stale JSON chunks from `dist/data/`
8. Generates monthly OG image and copies favicon

### Photo object shape (key fields)

| Field | Source | Notes |
|---|---|---|
| `id` | derived | `YYYY-MM-DD-{slug}` — from the photo's filename stem |
| `source` | always `'local'` | field kept for backward compatibility, not otherwise meaningful now |
| `title` | sidecar `title:` | |
| `description` | sidecar body | embeds (`![[...]]` / `![](...)`) stripped first — see Sidecar semantics |
| `dateTaken` | sidecar `dateTaken:` → EXIF | |
| `dateAdded` | `dateTaken` → file mtime | used as `<published>` in the feed |
| `sidecarUpdatedAt` | `fs.stat(sidecarPath).mtime` | used for feed `<updated>` bump |
| `url.display` | `/photos/ID@2400.avif` | |
| `url.download` | `/photos/ID@2400-wm.avif` | watermarked; used in feed image |
| `url.thumb` | `/photos/ID@800.webp` | |
| `exif` | sidecar top-level fields (`camera`, `lens`, etc.) → EXIF | one property per field — not nested |
| `tags` | sidecar `tags:` | rendered as hashtags in `feed.njk`; not auto-populated (defaults to `[]`) — add manually to a sidecar if wanted |
| `series` | `series/*.md` `photos:` list (overrides sidecar `series:`) | slug of the series this photo belongs to, or `null` |
| `seriesOrder` | `series/*.md` `photos:` list (overrides sidecar `seriesOrder:`) | 1-indexed position within the series |
| `seriesTitle` | derived from `series/{slug}.md` `title:` | only set when `series` is set |
| `seriesCount` | derived from `series/{slug}.md` `photos:` length | only set when `series` is set |

---

## Series / folders

`series/*.md` files define a series — front matter: `title`, optional `coverPhoto` (photo ID), `photos:` (ordered list of photo IDs, or `{ id, order }` objects). The Markdown body is the series description.

- `build/series.js` (`loadSeries()`) parses these into a slug → meta map, exposed to templates via `_data/series.js` (map) and `_data/seriesArray.js` (array)
- `_data/photos.js` applies series membership to each photo after merge/sort — series files are the single source of truth, overriding any `series`/`seriesOrder` set directly in a sidecar
- In the masonry grid, all photos belonging to a series collapse into a single **folder card** (manila folder aesthetic with peeking photo prints) — built by `GalleryCore.makeSeriesCard()`
- Clicking a folder card opens the **series overlay** (`src/scripts/series-overlay.js`): full-screen viewer with thumbnail strip, prev/next, and `N / Total` counter; clicking a photo within it opens the existing lightbox
- `src/series/series.njk` also generates a permalink page per series
- Folder card colours use the `--folder-*` tokens in `base.css` (see CSS design system below)

---

## URL slugs

- **Format:** `YYYY-MM-DD-{slug}` — derived from the image's filename stem, via `dateTitleStem()`/`toSlug()` in `build/utils/slug.js`.
- **Changing a photo's filename breaks the URL.** The permalink is `/photos/{id}/` and `id` comes straight from the filename — don't rename the image or its sidecar by hand once it's live. Use `npm run rename-photo -- <old-id> <new-id> --apply` (see `scripts/rename-photo.js`) — renaming just the sidecar orphans it, since the sidecar is looked up by the image's current stem.
- **Auto-rename:** `local.js`'s `autoRename()` only touches filenames that aren't already "clean" (`isCleanStem()`) — a brand-new messy filename (e.g. straight off a phone) gets renamed to a date-based stem once, using the sidecar's `title:` if one already exists, and the sidecar is renamed in lockstep. Once a file has a clean stem, `autoRename()` leaves it alone permanently, even if `title:` changes later.

---

## Sidecar semantics

- Every photo has a `.md` sidecar in `sidecars/` — `sidecars/ID.md`. Image files live separately, in `local/`.
- Auto-created on first build with EXIF values pre-filled
- EXIF fields (`camera`, `lens`, `focalLength`, `focalLength35`, `aperture`, `shutterSpeed`, `iso`) are **top-level frontmatter properties**, not nested under an `overrideExif:` object — each is independently editable
- These fields fall back to the photo's real EXIF when empty (`""` = not set, not override) — the `ov(override, fallback)` helper in `build/utils/sidecar.js` implements this
- `tags:` is not auto-populated (defaults to `[]`) — add manually to a sidecar if wanted
- **Auto-generated sidecars embed the photo itself** — `![](../local/filename)`, standard Markdown, pointing at the actual file in `local/`. Every sidecar shows its photo inline when opened in any Markdown-aware editor.
- **EXIF auto-backfill:** if a sidecar's EXIF/`dateTaken` fields are blank (e.g. pre-created from [`TEMPLATE.md`](TEMPLATE.md) before the photo's ever been processed), `backfillExifLines()` in `local.js` writes the real extracted values into those exact lines on disk — a targeted text replace, not a full re-serialize, so comments/formatting survive. Idempotent: once a line has a value it's left alone.
- **Image embeds in the body:** any Markdown embed (`![](url)` or `![](../local/file)`) in the sidecar body is stripped out by `stripImageEmbeds()` (`build/utils/sidecar.js`) before the body becomes the photo's `description` — lets you see the photo inline while writing the caption without the embed syntax leaking onto the live site.
- **`image:` (top-level frontmatter, added for Sveltia CMS):** the published thumbnail URL (`/photos/{id}@800.webp`), deterministic from the sidecar's own filename — not read by the build pipeline at all, purely so the CMS list view has something to render. Never derived from the body's `../local/` embed, which isn't reachable from the CMS (`local/` is gitignored — see the R2 trap above). Filled in the same way as the EXIF fields: `sidecarStub()` pre-fills it on a brand-new sidecar, `backfillExifLines()` fills it in on a `TEMPLATE.md`-seeded one once the photo's processed.

---

## Infinite scroll

Photos split into 60-photo chunks at `dist/data/photos-N.json`. The first 60 photos (chunk 1) are inlined in `index.njk` as `#gallery-data` for instant first paint — no network request for the initial render. `gallery.js` fetches chunks 2+ via `IntersectionObserver` on `#scroll-sentinel`. `window.GalleryPhotos` is the live array — `lightbox.js` and `stack.js` hold a reference (not a copy) so they automatically cover newly loaded photos.

---

## Atom feed

`dist/feed.xml` is generated on every build by `src/feed.njk`. Contains the 15 most recent photos.

- `<published>` = `dateAdded` — when the photo was added to the site (not when photographed), so new posts always surface at the top of subscribers' timelines
- `<updated>` = `max(dateAdded, sidecarUpdatedAt)` — bumps forward when the sidecar file is saved; triggers re-surfacing in feed readers
- Content per entry: watermarked image, full description, "Captured [date]", EXIF line
- Feed autodiscovery link in `base.njk` `<head>` — readers find it automatically from any page URL

---

## CSS design system

All design values live in `src/styles/base.css` as `:root` custom properties. Never hardcode a value that has a token.

| Category | Tokens |
|---|---|
| Colours | `--bg`, `--paper`, `--paper-aged`, `--accent`, `--ink-paper`, `--stamp`, `--overlay`, `--on-dark` |
| RGB components | `--accent-rgb`, `--ink-paper-rgb`, `--sepia-rgb`, `--stamp-rgb` — for `rgba(var(--x-rgb), 0.3)` composition |
| Accent opacity | `--accent-faint` (0.12) → `--accent-body` (0.9) |
| On-dark opacity | `--paper-faint` (0.5) → `--paper-strong` (0.92) — lightbox/overlay context only |
| Type scale | `--text-2xs` (0.6rem) → `--text-2xl` (1.9rem) |
| Fonts | `--font-serif` (Schoolbell), `--font-ibm-sans` (IBM Plex Sans), `--font-mono` (VT323), `--font-mono-read` (IBM Plex Mono) |
| Durations | `--dur-fast` (0.15s), `--dur-med` (0.22s), `--dur-slow` (0.35s) |
| Folder/series colours | `--folder-icon-light/dark`, `--folder-tab-light/dark`, `--folder-back-light/dark`, `--folder-face-light/dark` — manila folder card gradients |

**Intentional raw values** (not tokens): shadow layers in `photo-card.css` / `lightbox.css` / `stack.css` (distinct visual weights).

### Breakpoints

Two distinct thresholds — intentionally different:

| px | What switches |
|---|---|
| 560 | Mobile layout: single-column grid, mobile header padding, stack card sizing |
| 680 | Lightbox layout: two-column → stacked, FLIP animation enabled/disabled, meta panel default open/closed |

### Hover rules

All `:hover` rules are inside `@media (hover: hover)` — prevents iOS Safari sticky-hover. When combining `:hover` and `:focus-visible`, split them: `:focus-visible` stays outside so keyboard nav works on all devices.

### Safe-area zones (Dynamic Island / Liquid Glass browser bar)

`html { background-color: var(--bg) }` fills the iOS safe-area zones naturally — no overlay required. `viewport-fit=cover` is intentionally absent so the system chrome stays in sync with the page background.

---

## View toggle and stack view

`#view-toggle` is a `position: fixed` FAB (bottom-right). Three bare icon buttons: grid, stack, shuffle.

- `gallery-view` and `gallery-shuffle` persisted in localStorage via `window.ViewState`
- Toggling shuffle calls `location.reload()` to avoid ordering inconsistencies across partially-loaded chunks
- Stack view keeps only one `.photo-card` in the DOM at a time; navigation discards and rebuilds it via `GalleryCore.makeCard()`
- Stack chunk loading: `checkChunkProximity()` triggers `IntersectionObserver` when within 5 photos of loaded count

Script load order in `index.njk`: `gallery-core.js → view-toggle.js → gallery.js → stack.js → lightbox.js → series-overlay.js`

---

## Lightbox animation

- **Desktop (> 680px):** FLIP open/close; directional slide on prev/next navigation; zoom-from-thumbnail when origin card is visible
- **Mobile (≤ 680px):** backdrop fade open; 180ms opacity fade close — FLIP felt janky on touch
- `flipClose` falls back to `zoomClose` (scale + fade) when origin card is off-screen

---

## Monthly OG image

`build/og-image.js` generates `dist/og-image.jpg` (1200×630) on every build. Seed: `year * 12 + month` — same build within a calendar month always produces the same image. 6 layout templates; photos Fisher-Yates shuffled with seeded PRNG. CI cron (`0 6 1 * *`) regenerates it on the 1st of each month.

Favicon is fixed (variant 4, stacked prints). `build/gen-favicon.js` copies pre-rendered files from `src/images/` — no canvas at build time.

---

## Content management (Sveltia CMS)

`/admin` (`src/admin/index.html` + `config.yml`) is [Sveltia CMS](https://github.com/sveltia/sveltia-cms) — a git-backed editor that commits straight to `main` via the GitHub API, same as any manual sidecar edit.

- **Editable:** `sidecars/*.md` (thumbnail, title, EXIF override fields, tags, series/seriesOrder, caption body) and `series/*.md` (title, cover photo, ordered photo list, description) — the `photos` collection has `create: false`/`delete: false`.
- **Not editable:** new photos. Creating one always stays the `local/` → R2 → `autoRename()` flow — a CMS-authored sidecar wouldn't exist before the photo's first build, so it would miss the clean-slug path (see URL slugs, above).
- **Thumbnails:** the `image:` frontmatter field (see Sidecar semantics, above) — not the caption's `![](../local/{id}.jpg)` embed, which is unreachable from the CMS (`local/` is gitignored) and always renders broken there. `stripImageEmbeds()` strips that embed line regardless of exact form either way, so it's harmless to leave alone or delete — the only loss from deleting it is the inline preview next time the sidecar's opened in an editor like Obsidian.
- **Auth:** GitHub OAuth via the shared [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) Cloudflare Worker (`base_url` in `config.yml`) — the same Worker `musings/config.yml` uses. Its `ALLOWED_DOMAINS` env var must include `photos.thedataareclean.com` for sign-in to work here.

---

## Runtime and deploy

| Concern | Detail |
|---|---|
| Hosting | GitHub Pages — `dist/` uploaded as Pages artifact |
| CI | `.github/workflows/deploy.yml` — triggers on push to `main`, manual dispatch, and monthly cron (OG image refresh) |
| Local auto-publish | `scripts/publish-local.js`, via launchd every 20 min — backs up new `local/` originals to R2, commits + pushes `sidecars/` if changed (push triggers CI) |
| Node | 20 (CI); local version managed via nvm or Homebrew |

---

## Config model

All config in `config.js`. No secrets in the file — sensitive values via env vars:

| Env var | Purpose |
|---|---|
| `SITE_URL` | Full deployed URL — required for absolute URLs in feed and OG tags |
| `R2_BUCKET` / `R2_ENDPOINT_URL` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 credentials — optional, both `sync:r2` and the CI download step no-op without them |

Font cache: `.cache/*.ttf`.
