# CLAUDE.md — Memories Gallery

Developer and AI reference for the Memories photography gallery.

**Stack:** Eleventy 3.x · Nunjucks · vanilla CSS · vanilla JS · Node.js build pipeline
**Author:** Arpit (@thedataareclean)

---

## Commands

```sh
npm run dev               # Eleventy dev server + live reload — http://localhost:3003
npm run build             # Production build → dist/
npm run build:fresh       # Force re-fetch Glass API (bypasses 1-hour cache)

npm run rename            # Dry-run rename preview for all photos (local + glass sidecars)
npm run rename -- --apply # Apply renames
npm run rename:local      # Local photos only
npm run rename:glass      # Glass sidecars only

npm run sync:glass        # Pull latest Glass API data without a full build
npm run gen:favicon       # Regenerate apple-touch-icon.png + favicon-32.png from SVG design
npm run gen:og            # Regenerate og-image.jpg manually (requires a prior build)
```

---

## File structure

```
config.js              Site + build configuration (single source of truth)
.eleventy.js           Eleventy config: filters, passthrough, output dir

_data/
  photos.js            Data pipeline: Glass + local → merged array + JSON chunks + stale prune
  siteConfig.js        Exposes config.site to templates

_includes/
  layouts/
    base.njk           HTML shell: head, CSS links, OG tags, content slot

src/
  index.njk            Gallery index: masonry grid + lightbox
  photos/
    photo.njk          Per-photo permalink pages (Eleventy pagination, size: 1)
    photos.11tydata.js Computed data: pageTitle, ogImage, ogDescription
  styles/
    base.css           Design tokens + reset (single source of truth for all tokens)
    desk.css           Wood grain background, vignette, header, footer, mobile safe-area edge fades (.fade-top / .fade-bottom)
    grid.css           Masonry grid, mobile single-column
    photo-card.css     Card: rotation, shadows, hover (mouse-only), caption
    lightbox.css       Lightbox modal: two-column desktop, stacked mobile
    photo-page.css     Individual photo permalink page layout
    stack.css          Stack view: stage, shadow layers, nav buttons, card animations
    view-toggle.css    View toggle widget: grid/stack buttons + shuffle toggle
  scripts/
    gallery-core.js    Shared card factory (makeCard, formatDateStamp, buildBackExif, SVG icons) — exposed as window.GalleryCore
    gallery.js         Grid rendering, JS masonry, infinite scroll — consumes GalleryCore
    lightbox.js        Lightbox open/close FLIP animation (desktop) / fade (mobile), keyboard nav
    stack.js           Stack view: navigation, WAAPI card transitions, swipe, chunk proximity trigger — exposed as window.StackView
    view-toggle.js     window.ViewState singleton (localStorage r/w, Fisher-Yates shuffle); toggle button wiring

build/
  exif.js              EXIF extraction via exifr
  merge.js             Deduplication (local overrides Glass) + date sort
  watermark.js         Watermark compositing via sharp
  gen-watermark.js     Generates the watermark asset
  sources/
    glass.js           Glass API pagination, slug IDs, sidecar create/merge
    local.js           Local photo processor: auto-rename, EXIF, sharp resize
  utils/
    slug.js            toSlug(), dateTitleStem(), isCleanStem()
    sidecar.js         Shared sidecar read/write helpers

scripts/
  rename.js            Master rename: runs rename-local.js then rename-glass.js
  rename-local.js      Rename local photos by EXIF date + title
  rename-glass.js      Rename glass sidecars by title (injects glassAutoId first)
  sync-glass.js        Standalone Glass sync — fetches API, updates cache + sidecars
  glass-sync.sh        Shell wrapper for launchd (resolves node across nvm/Homebrew)

launchd/
  com.thedataareclean.photos-sync.plist  Weekly launchd agent (Sundays 08:00)

local/                 Drop photos here — auto-processed on build
glass-sidecars/        One .md per Glass photo — auto-created, edit freely
dist/                  Build output (not committed)
  data/                Paginated JSON chunks (photos-1.json, photos-2.json, …)
  photos/              Resized local photo assets (auto-pruned by build)
```

---

## Architecture

### Data pipeline
`_data/photos.js` returns the photo array with side effects: resizes images into `dist/photos/`, writes `dist/data/photos-N.json` chunks, creates sidecar stubs, prunes stale assets. All side effects run before Eleventy generates HTML — correct order by design.

`pruneStaleAssets()` derives expected filenames from `photo.url.*` and deletes anything in `dist/photos/` not in that set. Also removes `photos-N.json` chunks beyond the current count. `dist/` stays accurate without manual cleanup.

### Glass cache
`.cache/glass-raw.json` stores the raw Glass API response. `glassToUnified()` runs on every build from this cache — changing slug logic or field mapping takes effect immediately without `--fresh`. The cache has a 1-hour TTL; use `npm run build:fresh` or `npm run sync:glass` to bypass it.

### Weekly Glass sync via launchd
`launchd/com.thedataareclean.photos-sync.plist` runs `scripts/glass-sync.sh` every Sunday at 08:00. The shell wrapper resolves node via nvm → Homebrew (Apple Silicon) → Homebrew (Intel) → system PATH, since launchd runs with a minimal PATH. Logs to `~/Library/Logs/photos-sync.log`.

```sh
cp launchd/com.thedataareclean.photos-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.thedataareclean.photos-sync.plist

launchctl unload ~/Library/LaunchAgents/com.thedataareclean.photos-sync.plist
```

### URL slugs
Glass IDs: `YYYY-MM-DD-glass-{slug}` — derived from date + first word of description. Local IDs: `YYYY-MM-DD-local-{slug}` — derived from filename. **Changing a Glass description or local filename changes the URL.** Edit the sidecar body (not the Glass description) to update display text without breaking links.

### Glass sidecar renaming
`rename-glass.js` renames sidecars to match their `title:` field. Before renaming it injects `glassAutoId: "original-stem"` into the frontmatter. On the next build, `glass.js` builds an ID map from all `glassAutoId` values so it can still match the sidecar after the rename. The build never depends on the sidecar filename.

### Sidecar override semantics
Empty string `""` in a sidecar field falls back to the Glass/EXIF source value — not the override. Clearing a field restores the original. Implemented via the `ov(override, fallback)` helper in `glass.js` and `local.js`.

### Infinite scroll
Photos split into 60-photo chunks at `dist/data/photos-N.json`. The index page inlines chunk 1 for instant first paint; `gallery.js` fetches subsequent chunks via `IntersectionObserver` on `#scroll-sentinel`. `window.GalleryPhotos` is the live array — `lightbox.js` and `stack.js` hold a reference (not a copy) so they automatically cover newly loaded photos.

### CSS design tokens
All design values live in `base.css` as `:root` custom properties. Token categories:
- **Colours:** `--bg`, `--paper`, `--paper-aged`, `--accent`, `--ink-paper`, `--stamp`, `--overlay`, `--on-dark`
- **RGB components:** `--accent-rgb`, `--ink-paper-rgb`, `--sepia-rgb`, `--stamp-rgb` — enables `rgba(var(--accent-rgb), 0.3)` composition
- **Accent opacity steps:** `--accent-faint` (0.12) through `--accent-body` (0.9)
- **On-dark opacity steps:** `--paper-faint` (0.5) through `--paper-strong` (0.92) — lightbox/overlay context only
- **Type scale:** `--text-2xs` (0.6rem) through `--text-2xl` (1.9rem)
- **Fonts:** `--font-serif` (Schoolbell), `--font-ibm-sans` (IBM Plex Sans), `--font-mono` (VT323), `--font-mono-read` (IBM Plex Mono)
- **Durations:** `--dur-fast` (0.15s), `--dur-med` (0.22s), `--dur-slow` (0.35s)

Never hardcode a value that has a token. The grain gradients in `desk.css` use raw rgba intentionally — they are texture-specific. Shadow layers in `photo-card.css`, `lightbox.css`, and `stack.css` use raw rgba intentionally — each has a distinct visual weight. The safe-area edge fades in `desk.css` use `#000` intentionally — pure black regardless of theme.

### Hover rules — mouse only
All `:hover` rules on interactive cards and buttons are wrapped in `@media (hover: hover)`. This prevents iOS Safari's sticky-hover bug, where `:hover` fires on `touchstart` and stays applied to the element while the user scrolls past it. Rule: every new `:hover` style must be inside `@media (hover: hover)`. When a selector combines `:hover` and `:focus-visible`, split them — keep `:focus-visible` outside so keyboard navigation still works on all devices.

### Mobile safe-area edge fades
`.fade-top` and `.fade-bottom` are `position: fixed` elements in `base.njk`, hidden on desktop via `display: none`, activated inside `@media (max-width: 560px)` in `desk.css`. They sit at `z-index: 40` — above page content (1) but below the view-toggle (50) and lightbox (1000). Two separate elements are used instead of one with stacked gradients because `calc(env(safe-area-inset-*) + Npx)` inside `linear-gradient()` fails silently on iOS Safari (see Known traps). The fade colour is `#000`, not `var(--bg)`, so it masks content against any background.

### Lightbox animation — desktop vs mobile
The lightbox FLIP open/close animation only runs on desktop (`window.innerWidth > 680`). On mobile, open uses a plain backdrop fade and close uses a 180ms opacity fade — the FLIP zoom felt janky on touch. The 680px threshold matches the lightbox two-column layout breakpoint. `flipClose` also has a viewport-visibility check: if the origin card is off-screen, it falls back to `zoomClose` (scale + fade) to avoid non-uniform scale distortion from off-screen FLIP coordinates.

### Breakpoints
Two distinct breakpoints are used — they are intentionally different:
- **560px** — mobile layout switch: single-column grid, safe-area fades, mobile header padding, stack card sizing
- **680px** — lightbox layout switch: two-column → stacked, FLIP animation enabled/disabled, meta panel default open/closed

### View toggle and localStorage persistence

A three-button FAB (`#view-toggle`, `position: fixed; bottom: 24px; right: 20px`) switches between grid/stack views and controls shuffle. Bare icon buttons — no labels, no background, no border.

- `gallery-view` (`'grid'`|`'stack'`) and `gallery-shuffle` (`'on'`|`'off'`) are persisted in localStorage.
- `window.ViewState` reads/writes both keys. `gallery.js` calls `ViewState.applyShuffle()` before first render so order is consistent across both views.
- Toggling shuffle calls `location.reload()` — avoids ordering inconsistencies when partial chunks are already loaded.
- Grid/stack buttons: mutually exclusive, `aria-pressed` + `is-active` (filled icon). Shuffle: independent toggle, amber `--stamp` family when active.
- Attribution (`@thedataareclean`) lives in the site header for all layouts; also duplicated in the footer for the masonry grid layout.

Script load order in `index.njk`: `gallery-core.js → view-toggle.js → gallery.js → stack.js → lightbox.js`

### Stack view

One photo at a time, two CSS-only shadow layers (`div.stack-layer`) behind the card for depth. Navigate via prev/next buttons, keyboard ← →, or horizontal swipe.

- Only **one `.photo-card`** lives in the DOM at a time — built by `GalleryCore.makeCard()`, discarded on navigation. Card flip and lightbox work identically to grid view.
- Stack-specific card overrides (width, position, hover) use `#stack-stage .photo-card { }` — `photo-card.css` is not view-aware. View switching is a DOM show/hide (`hidden` on `#gallery-root` / `#stack-root`).
- **Animations (WAAPI):** exit slides off with rotation arc + fade (~350ms); enter rises from depth (scale 0.93→1, translateY 32→0, 80ms delay).
- **Chunk loading:** within 5 photos of the loaded count, `checkChunkProximity()` scrolls `#scroll-sentinel` into view, triggering the existing `IntersectionObserver` in `gallery.js`. `gallery.js` calls `window.StackView.onChunkLoaded()` after each chunk.
- **Lightbox:** `originCardEl` is stored at `open()` time for FLIP close — `cardEls[currentIndex]` would be wrong after lightbox-internal navigation since only one card exists in the DOM.
- **Swipe:** `pointerdown`/`pointerup` on `#stack-stage`; horizontal dominance check and 30px minimum threshold prevent accidental triggers.

### Monthly OG image generation

`build/og-image.js` generates `dist/og-image.jpg` (1200×630) on every build using `@napi-rs/canvas`. The homepage `og:image` meta tag always points to this file; per-photo pages use their own photo image.

**Deterministic monthly seed:** `year * 12 + month`. The same build within a calendar month always produces the same image. The seed changes on the 1st — a different template and photo set is selected.

**Templates:** 6 layout definitions in `TEMPLATES` (matching `sample/identity-preview.html`) — each is an array of card objects with `{ w, ar, left/right, top, rot, z }` as percentages of the 1200×630 canvas.

**Photo selection:** Photos are Fisher-Yates shuffled with the seeded PRNG, then the first N are used (N = number of cards in the selected template).

**Image sources:** Glass photos are read from `.cache/glass-images/${id}.bin` (populated by the watermarking step earlier in the same build). Local photos are read from `dist/photos/`. CDN fetch is a fallback only.

**Fonts:** IBM Plex Sans 500 and Schoolbell are downloaded on first run and cached to `.cache/`. Download order: GitHub release URL (primary) → Google Fonts CSS v1 (fallback). IBM Plex Sans from `IBM/plex@v6.4.0`; Schoolbell from `google/fonts` main. The CI workflow installs `fonts-open-sans fonts-liberation` via apt before building so `sans-serif` always resolves even if both downloads fail.

**Scheduling:** `.github/workflows/deploy.yml` includes `schedule: cron: '0 6 1 * *'` — runs the full build on the 1st of every month at 06:00 UTC, regenerating the OG image and favicon for the new month automatically.

### Favicon

The favicon is fixed: variant 4 (stacked prints, warm amber/sepia palette). On each build, `build/gen-favicon.js` copies the pre-rendered files from `src/images/` directly to `dist/` — no canvas rendering occurs at build time.

There is no monthly rotation or seed selection for the favicon. The scheduled workflow cron does not affect the favicon.

`npm run gen:favicon` re-renders `src/images/` from the variant 4 design — run this if you change the favicon design, then commit the result.

### Local photo renaming
`processLocal()` calls `autoRename()` before processing. Any file whose stem doesn't start with `YYYY-MM-DD` is renamed in-place (image + sidecar) using EXIF date + sidecar title. **The build mutates `local/` on disk.** Files already starting with a date are never touched.

---

## Photo metadata

Every photo has a Markdown sidecar. Glass photos: `glass-sidecars/YYYY-MM-DD-glass-slug.md`. Local photos: `local/YYYY-MM-DD-local-slug.md` (co-located with the image).

Sidecars are auto-created on first build with real EXIF/Glass values pre-filled.

```markdown
---
title: "Bougainvillea wall"       # Card label + photo page h1
tags: [street, mumbai]

overrideExif:
  camera: "Fujifilm X-T50"        # Leave blank to use Glass/EXIF source
  lens: "XF23mmF2 R WR"
  focalLength: "23mm"
  focalLength35: "35mm"
  aperture: "f/2.8"
  shutterSpeed: "1/250s"
  iso: 400

dateTaken: "2026-03-09T08:57:02Z" # Leave blank to use EXIF date
---

Description in the lightbox + photo permalink page. Supports multiple paragraphs.
```

**iPhone lens format:** `"Back Wide 6.765mm ƒ/1.78"` — strip device name, use ƒ (not f).

**Glass title default:** first word of Glass description. Override via `title:` in the sidecar.

**Local rename trigger:** adding/changing `title:` in a local sidecar renames the image file and sidecar on next build. The URL changes with the filename.

---

## Known traps

### Changing a slug breaks the URL
The Glass slug uses the first word of the description. Change it → new slug → 404 for old links. To update display text without breaking the URL, edit the sidecar body (not the Glass description).

### Empty overrideExif fields fall back to source
`overrideExif: { camera: "" }` falls back to the EXIF source value (empty string = not set). `iso: 0` would override with 0 — be explicit with numeric zeros.

### Auto-rename runs before the sidecar is read
First build after dropping a new photo: sidecar is created from EXIF, then the file is renamed. The sidecar filename updates too. No data is lost, but a two-step build is normal for brand-new files.

### Glass cache TTL
1-hour TTL. New Glass photos won't appear until the cache expires. Use `npm run build:fresh` or `npm run sync:glass` to force a re-fetch.

### Per-photo page images need root-relative URLs
Local photo URLs are root-relative (`/photos/filename.jpg`) so they resolve correctly from `/photos/YYYY-MM-DD-local-slug/`. Never make them relative paths.

### Google Fonts CSS v1 API returns dynamic URLs without `.ttf` extension
The old Google Fonts API endpoint (`fonts.googleapis.com/css?family=…`) with a legacy User-Agent used to return CSS with literal `.ttf` URLs in `url(…)`. It now returns dynamic gstatic URLs like `url(https://fonts.gstatic.com/l/font?kit=…)` with no extension. Any regex matching `.ttf` in the URL will silently fail to match. Use a direct GitHub release URL as the primary source and the Google Fonts CSS approach only as a fallback with a regex that matches any `fonts.gstatic.com` URL.

### OG image text invisible in headless CI without system fonts
`@napi-rs/canvas` uses Skia for rendering. On a bare Ubuntu runner with no system fonts installed, `sans-serif` and `cursive` CSS font families resolve to nothing — `fillText` succeeds but draws invisible/zero-width glyphs. Fix: install `fonts-open-sans fonts-liberation` via apt before building so generic family names always resolve.

### `overflow-x: hidden` on `html` breaks `position: fixed` on iOS Safari
Applying `overflow-x: hidden` to the `<html>` element causes `position: fixed` children to stop behaving as fixed — they act as if they are `position: absolute` relative to the clipped ancestor. The symptom is fixed overlays (like `.fade-top`, `.fade-bottom`, the lightbox) disappearing or scrolling with the page. Safe on `body`; never add it to `html`.

### `calc(env() + px)` inside `linear-gradient` fails silently on iOS Safari
Using `calc()` with `env()` inside a `linear-gradient` value (e.g. `linear-gradient(... calc(env(safe-area-inset-top, 0px) + 60px) ...)`) causes the entire background declaration to be silently dropped on iOS Safari. Workaround: use `env()` directly inside the gradient (without `calc()`), and put `calc(env() + px)` only in regular CSS properties like `height`. Example in `desk.css` `.fade-top`: `height: calc(env(safe-area-inset-top, 0px) + 80px)` with `env(safe-area-inset-top, 0px)` used directly as a gradient stop.

---

## Keeping docs updated

Update **CLAUDE.md** whenever:
- A new build script, npm command, or pipeline step is added or removed
- The file structure changes (new directories, renamed files)
- Architecture decisions change (e.g. slug logic, sidecar semantics, chunk size, cache TTL)
- A new "known trap" is discovered
- CSS token conventions change (new token categories, new naming patterns)

Update **README.md** whenever:
- User-facing commands change (`npm run *`)
- The photo metadata schema changes (sidecar fields, frontmatter format)
- Setup steps change (launchd, dependencies)

Neither file needs updating for: bug fixes, content edits, style tweaks, or refactors that don't change observable behaviour or mental models.

---

## Glass sync workflow

When pulling new Glass data and pushing to the repo, always run steps in this order:

1. `npm run sync:glass` — fetch latest Glass API data
2. `npm run build` — generates new sidecar stubs; slugs are now `YYYY-MM-DD-glass-{first-word}` automatically
3. Fill in descriptions and tags in any new sidecar stubs (`glass-sidecars/`)
4. `npm run build` — verify clean, zero errors
5. Commit sidecar files and push

**Slug generation:** The build derives the slug from the first word of the Glass description only (e.g. `"Mornings. One thing…"` → `2026-03-21-glass-mornings`). No rename step needed — stubs are created with the correct short slug from the start. The sidecar body is pre-filled with everything after the first word.

**Photos with no Glass description** fall back to a time-of-day slug (e.g. `2024-08-15-glass-104137`). Set a `title:` in the sidecar to give them a human-readable label without changing the URL.

---

## Pre-push checklist

- [ ] `npm run build` — zero errors, zero warnings
- [ ] `dist/` not committed
- [ ] Browser console clean — no JS errors, no 404s
- [ ] New local photos renamed (date-based stem) and sidecars auto-created
- [ ] `glass-sidecars/` has one file per Glass photo
- [ ] Gallery grid loads, masonry correct at desktop + mobile
- [ ] Lightbox opens (desktop: FLIP zoom from card; mobile: fade), prev/next/close, keyboard nav
- [ ] Lightbox close when card is off-screen: zoom-out fade (no squish/stretch)
- [ ] Infinite scroll loads next chunk when > 60 photos
- [ ] Per-photo pages load at `/photos/YYYY-MM-DD-{source}-{slug}/`
- [ ] View toggle widget visible bottom-right of gallery, all three buttons functional
- [ ] Grid ↔ stack switch persists across page reload
- [ ] Shuffle toggle randomises order on reload; toggling off restores date order
- [ ] Stack view: prev/next buttons, keyboard ← →, and swipe all navigate
- [ ] Stack counter reads `N / Total` and updates as chunks load
- [ ] Stack lightbox: opens from visible card, FLIP animation correct, closes back to card
- [ ] Stack chunk loading: new chunk fetches when within 5 photos of loaded count
- [ ] Card flip (postcard back) works in both grid and stack view
- [ ] Mobile: touch targets ≥ 44px, flip button visible without hover, swipe works

---

## Commit convention

`{Type}: {short description}`

| Type | Use for |
|---|---|
| `Add` | New feature or photo source |
| `Fix` | Bug fix |
| `Update` | Change to existing feature or content |
| `Refactor` | Code restructure, no behaviour change |
| `Docs` | CLAUDE.md, README, comments only |
| `Chore` | Dependencies, config, `.gitignore` |

## Release tagging

```sh
git tag -a v1.0.0 -m "Brief description"
git push origin v1.0.0
```

| Part | When to increment |
|---|---|
| MAJOR | Visual redesign or change in site concept |
| MINOR | New feature (new source, tag pages, RSS, etc.) |
| PATCH | Bug fix, docs update, config/CI change |

**Never tag content commits** — photo syncs (`Add: N new Glass photos`, `Chore: sync Glass`, sidecar edits) are not releases and should not get a version tag.
