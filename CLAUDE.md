# CLAUDE.md — Memories Gallery

Operating manual for Claude. Architecture lives in [APP.md](APP.md). Commands live in [COMMANDS.md](COMMANDS.md).

---

## Quick facts

- **Stack:** Eleventy 3.x · Nunjucks · vanilla CSS · vanilla JS · Node.js build pipeline
- **Author:** Arpit (@thedataareclean)
- **Local dev:** `npm run dev` → http://localhost:3003
- **Entry point:** `_data/photos.js` — runs first, produces photo array + all side effects
- **Output:** `dist/` (not committed) → deployed to GitHub Pages via CI

---

## Before you change code

- Run `npm test` — unit tests for the pure logic (slug generation, sidecar parsing/overrides, EXIF backfill), must pass
- Run `npm run build` — must exit zero errors, zero warnings
- Check browser console — no JS errors, no 404s
- Test the golden path: grid loads → lightbox opens → prev/next/close → per-photo page loads
- Check mobile at 375px width and desktop at 1280px
- If touching the feed: verify `dist/feed.xml` has 15 entries and valid XML structure

---

## Common traps

**Renaming a photo's file (or its sidecar) breaks the URL**
`id` — and so the permalink `/photos/{id}/` — comes straight from the image's filename stem. `autoRename()` only touches filenames that aren't already "clean" (`isCleanStem()` in `build/utils/slug.js`), so once a file has been renamed once, editing its sidecar's `title:` afterward does *not* rename it again — safe. Manually renaming the image or sidecar file yourself is what breaks the URL.

**Empty EXIF sidecar fields fall back to source, not blank**
EXIF fields (`camera`, `lens`, `aperture`, etc.) are top-level sidecar properties, not nested — `camera: ""` restores the EXIF source value. `iso: 0` overrides with 0 — be explicit with numeric zeros.

**Auto-rename runs before the sidecar is read**
First build after dropping a new local photo: sidecar is created from EXIF, then the file is renamed. Two-step build is normal for new files — no data is lost.

**Photo URLs must be root-relative**
`/photos/filename.jpg` not `photos/filename.jpg` — they resolve from `/photos/YYYY-MM-DD-slug/` permalink pages.

**`overflow-x: hidden` on `<html>` or `<body>` can break `position: fixed` on iOS Safari**
On `<html>`: fixed children behave as `position: absolute`. On `<body>`: real child elements may be contained by body rather than the viewport on some iOS versions. The codebase uses `overflow-x: clip` on `body` (see `base.css`) — same visual clipping result, does not create a scroll container, does not trap fixed elements. Never revert this to `hidden`.

**Any CSS function inside `linear-gradient` stops fails silently on iOS Safari**
`calc(env() + px)`, bare `env()`, `max(env(), px)`, and similar expressions as gradient color-stops are silently dropped — the entire `background` declaration is invalidated and the element has no background. Use only literal `px` values as stops; put `calc(env() + px)` only in regular CSS properties like `height`.

**OG image text invisible in headless CI without system fonts**
`@napi-rs/canvas` uses Skia — `sans-serif` and `cursive` resolve to nothing on a bare Ubuntu runner. CI installs `fonts-open-sans fonts-liberation` via apt. Don't remove that step.

**Google Fonts CSS v1 API no longer returns `.ttf` URLs**
The old endpoint now returns dynamic `fonts.gstatic.com` URLs with no extension. Any regex matching `.ttf` will silently fail. Primary font source is the GitHub release URL; Google Fonts is fallback only. Match any `fonts.gstatic.com` URL, not `.ttf`.

**Feed `<updated>` only bumps when the sidecar file is saved**
The pipeline reads sidecar `mtime` via `fs.stat()`. If you edit a description but the file mtime doesn't change (e.g. copying content without touching the file), the feed won't signal an update. Just save the file normally.

---

## Review triggers

When adding a **new npm script**: add it to [COMMANDS.md](COMMANDS.md) and update the Commands section in this file.

When adding a **new build side-effect** (new output file, new cache file): document it in [APP.md](APP.md) under Data pipeline, and add it to `pruneStaleAssets()` if it should be auto-cleaned.

When adding a **new CSS custom property**: add it to the token table in [APP.md](APP.md) under CSS design system. Never hardcode a value that has a token.

When adding a **new `:hover` rule**: wrap it in `@media (hover: hover)`. If combining with `:focus-visible`, split the selectors — keep `:focus-visible` outside.

When changing **slug logic or sidecar semantics**: update [APP.md](APP.md) — these are URL-stability decisions.

When shipping a **new feature**: add an entry to [CHANGELOG.md](CHANGELOG.md) under UNRELEASED and move it to a dated version on release.

---

## Brief file map

Key files only. Full map: [README.md](README.md). Architecture: [APP.md](APP.md).

```
config.js              Site + build config (single source of truth)
.eleventy.js           Filters, passthrough, output dir
_data/photos.js        Pipeline entry point — runs before all templates
_includes/layouts/base.njk  HTML shell, OG tags, feed autodiscovery
src/index.njk          Gallery index (grid, stack, lightbox, infinite scroll)
src/feed.njk           Atom feed → dist/feed.xml
src/styles/base.css    Design tokens — all CSS custom properties
build/sources/local.js Photo processor: auto-rename, EXIF, sidecar create/merge
build/sources/r2.js    R2 backup/restore for local/ originals
build/og-image.js      Monthly OG image (seeded PRNG, 6 templates)
build/series.js        loadSeries() — parses series/*.md into slug → meta map
series/*.md            One file per series: title, cover photo, ordered photo list
src/scripts/series-overlay.js  Full-screen series viewer (thumbnail strip, prev/next)
```

---

## Constraints and guardrails

- `dist/` is never committed
- Content commits (photo syncs, sidecar edits) are never tagged as releases
- All `:hover` rules inside `@media (hover: hover)` — no exceptions
- Never hardcode a colour, size, or duration that has a CSS token in `base.css`
- Feed image URLs must be absolute — `photo.url.download | absUrl(siteConfig.url)` pattern
- `SITE_URL` env var must be set in CI for feed and OG tag URLs to be valid

---

## Pre-push checklist

- [ ] `npm test` — all unit tests pass
- [ ] `npm run build` — zero errors, zero warnings
- [ ] `dist/` not committed
- [ ] Browser console clean — no JS errors, no 404s
- [ ] New photos renamed (date-based stem) and sidecars auto-created
- [ ] `sidecars/` has one file per photo
- [ ] Gallery grid loads, masonry correct at desktop + mobile
- [ ] Lightbox opens (desktop: FLIP zoom; mobile: fade), prev/next/close, keyboard nav
- [ ] Lightbox close when card is off-screen: zoom-out fade (no squish/stretch)
- [ ] Infinite scroll loads next chunk when > 60 photos
- [ ] Per-photo pages load at `/photos/YYYY-MM-DD-{slug}/`
- [ ] View toggle widget visible bottom-right, all three buttons functional
- [ ] Grid ↔ stack switch persists across page reload
- [ ] Shuffle toggle randomises order on reload; toggling off restores date order
- [ ] Stack view: prev/next, keyboard ← →, and swipe all navigate
- [ ] Stack counter reads `N / Total` and updates as chunks load
- [ ] Card flip (postcard back) works in both grid and stack view
- [ ] Mobile: touch targets ≥ 44px, flip button visible without hover, swipe works
- [ ] `dist/feed.xml` present, opens cleanly, shows 15 entries
- [ ] Series folder card renders in grid, opens series overlay
- [ ] Series overlay: thumbnail strip, prev/next, counter work; closing restores focus to the folder card; clicking a photo opens the lightbox
- [ ] Series permalink page loads at `/series/{slug}/`

---

## Release workflow

```sh
git tag -a v1.2.3 -m "Brief description"
git push origin v1.2.3
```

| Part | When to increment |
|---|---|
| MAJOR | Visual redesign or change in site concept |
| MINOR | New feature (new source, feed, tag pages, etc.) |
| PATCH | Bug fix, docs update, config/CI change |

**Commit convention:** `{Type}: {description}` — types: `Add` `Fix` `Update` `Refactor` `Docs` `Chore`

**Never tag content commits** — photo syncs, sidecar edits, and `Chore: auto-sync new sidecars` commits are not releases.

Move UNRELEASED entries in [CHANGELOG.md](CHANGELOG.md) to a dated version block on each release.
