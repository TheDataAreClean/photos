# APP.md — Memories Gallery

Architecture reference. Factual, no opinion. See [CLAUDE.md](CLAUDE.md) for operating instructions.

---

## Architecture at a glance

```
Glass API ──┐
            ├─→ _data/photos.js ──→ Eleventy build ──→ dist/ ──→ GitHub Pages
local/    ──┘        │
                     ├─→ dist/photos/   (resized + watermarked images)
                     ├─→ dist/data/     (paginated JSON chunks)
                     └─→ glass-sidecars/ (sidecar stubs, auto-created)
```

Eleventy is the only build step. `_data/photos.js` runs first and produces both the photo array (consumed by templates) and all side-effect outputs (images, JSON, sidecars) before any HTML is generated.

---

## Key directories

| Path | Responsibility |
|---|---|
| `config.js` | Single source of truth for site + build configuration |
| `.eleventy.js` | Eleventy config: filters, passthrough copies, output dir |
| `_data/photos.js` | Data pipeline entry point |
| `_data/siteConfig.js` | Exposes `config.site` to Nunjucks templates |
| `_includes/layouts/base.njk` | HTML shell: `<head>`, CSS links, OG tags, feed autodiscovery |
| `src/index.njk` | Gallery index — masonry grid, infinite scroll, lightbox, stack view |
| `src/feed.njk` | Atom feed → `dist/feed.xml` |
| `src/photos/photo.njk` | Per-photo permalink pages (Eleventy pagination, size: 1) |
| `src/styles/base.css` | Design tokens — single source of truth for all CSS custom properties |
| `build/sources/glass.js` | Glass API pagination, `glassToUnified()`, sidecar create/merge |
| `build/sources/local.js` | Local photo processor: auto-rename, EXIF, sharp resize, watermark |
| `build/merge.js` | Deduplication (local overrides Glass) + date sort |
| `build/og-image.js` | Monthly OG image generation via `@napi-rs/canvas` |
| `build/watermark.js` | Watermark compositing via sharp |
| `scripts/sync-glass.js` | Standalone Glass sync — updates cache + sidecars without a full build |
| `scripts/glass-sync.sh` | Shell wrapper for launchd (resolves node across nvm/Homebrew) |

---

## Data pipeline

`_data/photos.js` returns the merged photo array and has these side effects (all before Eleventy renders HTML):

1. Fetches Glass API (or reads 1-hour cache from `.cache/glass-raw.json`)
2. Processes local photos: auto-rename, EXIF extract, sharp resize, watermark
3. Merges + deduplicates (local overrides Glass on matching ID)
4. Sorts newest-first by `dateTaken`
5. Writes paginated JSON chunks to `dist/data/photos-N.json` (60 photos each)
6. Creates sidecar stubs for any new photos
7. Prunes stale image files from `dist/photos/` and stale JSON chunks from `dist/data/`
8. Generates monthly OG image and copies favicon

### Photo object shape (key fields)

| Field | Source | Notes |
|---|---|---|
| `id` | derived | `YYYY-MM-DD-glass-{slug}` or `YYYY-MM-DD-local-{slug}` |
| `source` | `'glass'` or `'local'` | |
| `title` | sidecar `title:` → Glass first word | |
| `description` | sidecar body → Glass description | sidecar body takes precedence |
| `dateTaken` | sidecar `dateTaken:` → EXIF → Glass `created_at` | |
| `dateAdded` | Glass `created_at` / local file mtime | used as `<published>` in the feed |
| `sidecarUpdatedAt` | `fs.stat(sidecarPath).mtime` | used for feed `<updated>` bump |
| `url.display` | `/photos/ID@2400.webp` (local) / CDN (Glass) | |
| `url.download` | `/photos/ID@wm.webp` | watermarked; used in feed image |
| `url.thumb` | `/photos/ID@800.webp` (local) / CDN (Glass) | |
| `exif` | sidecar `overrideExif:` → EXIF/Glass | camera, lens, focal, aperture, shutter, ISO |
| `tags` | sidecar `tags:` | stored, not yet rendered in UI |

---

## URL slugs

- **Glass:** `YYYY-MM-DD-glass-{first-word-of-description}` — e.g. `2026-03-27-glass-behind`
- **Local:** `YYYY-MM-DD-local-{filename-stem}` — derived from filename
- **Changing a slug breaks the URL.** Edit the sidecar body (not the Glass description) to update display text without 404s.
- **Glass sidecar renaming:** `rename-glass.js` injects `glassAutoId: "original-stem"` before renaming. `glass.js` builds an `autoIdMap` from all `glassAutoId` values each build so it can match sidecars regardless of filename.

---

## Sidecar semantics

- Every photo has a `.md` sidecar: `glass-sidecars/ID.md` or `local/ID.md`
- Auto-created on first build with EXIF/Glass values pre-filled
- `overrideExif` fields fall back to source when empty (`""` = not set, not override)
- `ov(override, fallback)` helper in `glass.js` and `local.js` implements this
- Local sidecars with `title:` set trigger a filename rename on the next build (URL changes)

---

## Infinite scroll

Photos split into 60-photo chunks at `dist/data/photos-N.json`. Chunk 1 is inlined on the index page for instant first paint. `gallery.js` fetches subsequent chunks via `IntersectionObserver` on `#scroll-sentinel`. `window.GalleryPhotos` is the live array — `lightbox.js` and `stack.js` hold a reference (not a copy) so they automatically cover newly loaded photos.

---

## Atom feed

`dist/feed.xml` is generated on every build by `src/feed.njk`. Contains the 15 most recent photos.

- `<published>` = `dateAdded` — when posted to Glass (not when photographed), so new posts always surface at the top of subscribers' timelines
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

**Intentional raw values** (not tokens): grain gradients in `desk.css` (texture-specific rgba), shadow layers in `photo-card.css` / `lightbox.css` / `stack.css` (distinct visual weights), safe-area fades in `desk.css` (`#000` — pure black regardless of theme).

### Breakpoints

Two distinct thresholds — intentionally different:

| px | What switches |
|---|---|
| 560 | Mobile layout: single-column grid, safe-area fades, mobile header padding, stack card sizing |
| 680 | Lightbox layout: two-column → stacked, FLIP animation enabled/disabled, meta panel default open/closed |

### Hover rules

All `:hover` rules are inside `@media (hover: hover)` — prevents iOS Safari sticky-hover. When combining `:hover` and `:focus-visible`, split them: `:focus-visible` stays outside so keyboard nav works on all devices.

### Mobile safe-area edge fades

`.fade-top` and `.fade-bottom` are `position: fixed` in `base.njk`, `display: none` on desktop, active at `max-width: 560px`. `z-index: 40` — above page content (1), below view-toggle (50) and lightbox (1000). Two separate elements (not one with stacked gradients) because `calc(env() + px)` inside `linear-gradient()` fails silently on iOS Safari.

---

## View toggle and stack view

`#view-toggle` is a `position: fixed` FAB (bottom-right). Three bare icon buttons: grid, stack, shuffle.

- `gallery-view` and `gallery-shuffle` persisted in localStorage via `window.ViewState`
- Toggling shuffle calls `location.reload()` to avoid ordering inconsistencies across partially-loaded chunks
- Stack view keeps only one `.photo-card` in the DOM at a time; navigation discards and rebuilds it via `GalleryCore.makeCard()`
- Stack chunk loading: `checkChunkProximity()` triggers `IntersectionObserver` when within 5 photos of loaded count

Script load order in `index.njk`: `gallery-core.js → view-toggle.js → gallery.js → stack.js → lightbox.js`

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

## Runtime and deploy

| Concern | Detail |
|---|---|
| Hosting | GitHub Pages — `dist/` uploaded as Pages artifact |
| CI | `.github/workflows/deploy.yml` — triggers on push to `main`, manual dispatch, and monthly cron |
| Glass sync in CI | `npm run sync:glass` runs before build; new sidecars auto-committed back to `main` with `[skip ci]` |
| Local weekly sync | launchd agent runs `scripts/glass-sync.sh` Sundays 08:00 |
| Node | 20 (CI); local version managed via nvm or Homebrew |

---

## Config model

All config in `config.js`. No secrets in the file — sensitive values via env vars:

| Env var | Purpose |
|---|---|
| `SITE_URL` | Full deployed URL — required for absolute URLs in feed and OG tags |
| `GLASS_TOKEN` | Glass API auth token — optional, improves rate limits |
| `FRESH=1` | Bypasses Glass cache on the current build |

Glass cache: `.cache/glass-raw.json`, 1-hour TTL. Image cache: `.cache/glass-images/*.bin`. Font cache: `.cache/*.ttf`.
