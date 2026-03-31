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
    desk.css           Wood grain background, vignette, header, footer
    grid.css           Masonry grid, mobile single-column
    photo-card.css     Card: rotation, shadows, hover, caption
    lightbox.css       Lightbox modal: two-column desktop, stacked mobile
    photo-page.css     Individual photo permalink page layout
    stack.css          Stack view: stage, shadow layers, nav buttons, card animations
    view-toggle.css    View toggle widget: grid/stack buttons + shuffle toggle
  scripts/
    gallery-core.js    Shared card factory (makeCard, seedRotation, formatDateStamp, buildBackExif, SVG icons) — exposed as window.GalleryCore
    gallery.js         Grid rendering, JS masonry, infinite scroll — consumes GalleryCore
    lightbox.js        Lightbox open/close FLIP animation, keyboard nav
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
Glass IDs: `YYYY-MM-DD-glass-{slug}` — derived from date + first six words of description. Local IDs: `YYYY-MM-DD-local-{slug}` — derived from filename. **Changing a Glass description or local filename changes the URL.** Edit the sidecar body (not the Glass description) to update display text without breaking links.

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

Never hardcode a value that has a token. The grain gradients in `desk.css` use raw rgba intentionally — they are texture-specific. Shadow layers in `photo-card.css`, `lightbox.css`, and `stack.css` use raw rgba intentionally — each has a distinct visual weight.

### View toggle and localStorage persistence

A three-button widget (`#view-toggle`) in the gallery header switches between grid/stack views and controls shuffle.

- `gallery-view` (`'grid'`|`'stack'`) and `gallery-shuffle` (`'on'`|`'off'`) are persisted in localStorage.
- `window.ViewState` reads/writes both keys. `gallery.js` calls `ViewState.applyShuffle()` before first render so order is consistent across both views.
- Toggling shuffle calls `location.reload()` — avoids ordering inconsistencies when partial chunks are already loaded.
- Grid/stack buttons: mutually exclusive, `aria-pressed` + `is-active`. Shuffle: independent toggle, amber `--stamp` family when active.

Script load order in `index.njk`: `gallery-core.js → view-toggle.js → gallery.js → stack.js → lightbox.js`

### Stack view

One photo at a time, two CSS-only shadow layers (`div.stack-layer`) behind the card for depth. Navigate via prev/next buttons, keyboard ← →, or horizontal swipe.

- Only **one `.photo-card`** lives in the DOM at a time — built by `GalleryCore.makeCard()`, discarded on navigation. Card flip and lightbox work identically to grid view.
- Stack-specific card overrides (width, position, hover) use `#stack-stage .photo-card { }` — `photo-card.css` is not view-aware. View switching is a DOM show/hide (`hidden` on `#gallery-root` / `#stack-root`).
- **Animations (WAAPI):** exit slides off with rotation arc + fade (~350ms); enter rises from depth (scale 0.93→1, translateY 32→0, 80ms delay).
- **Chunk loading:** within 5 photos of the loaded count, `checkChunkProximity()` scrolls `#scroll-sentinel` into view, triggering the existing `IntersectionObserver` in `gallery.js`. `gallery.js` calls `window.StackView.onChunkLoaded()` after each chunk.
- **Lightbox:** `originCardEl` is stored at `open()` time for FLIP close — `cardEls[currentIndex]` would be wrong after lightbox-internal navigation since only one card exists in the DOM.
- **Swipe:** `pointerdown`/`pointerup` on `#stack-stage`; horizontal dominance check and 30px minimum threshold prevent accidental triggers.

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
The Glass slug uses the first six words of the description. Change it → new slug → 404 for old links. To update display text without breaking the URL, edit the sidecar body (not the Glass description).

### Empty overrideExif fields fall back to source
`overrideExif: { camera: "" }` falls back to the EXIF source value (empty string = not set). `iso: 0` would override with 0 — be explicit with numeric zeros.

### Auto-rename runs before the sidecar is read
First build after dropping a new photo: sidecar is created from EXIF, then the file is renamed. The sidecar filename updates too. No data is lost, but a two-step build is normal for brand-new files.

### Glass cache TTL
1-hour TTL. New Glass photos won't appear until the cache expires. Use `npm run build:fresh` or `npm run sync:glass` to force a re-fetch.

### Per-photo page images need root-relative URLs
Local photo URLs are root-relative (`/photos/filename.jpg`) so they resolve correctly from `/photos/YYYY-MM-DD-local-slug/`. Never make them relative paths.

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

## Pre-push checklist

- [ ] `npm run build` — zero errors, zero warnings
- [ ] `dist/` not committed
- [ ] Browser console clean — no JS errors, no 404s
- [ ] New local photos renamed (date-based stem) and sidecars auto-created
- [ ] `glass-sidecars/` has one file per Glass photo
- [ ] Gallery grid loads, masonry correct at desktop + mobile
- [ ] Lightbox opens, FLIP animation, prev/next/close, keyboard nav
- [ ] Infinite scroll loads next chunk when > 60 photos
- [ ] Per-photo pages load at `/photos/YYYY-MM-DD-{source}-{slug}/`
- [ ] View toggle widget visible top-right of gallery, all three buttons functional
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
| PATCH | Bug fix, content update, sidecar edit |
