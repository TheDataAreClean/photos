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

- Run `npm run build` — must exit zero errors, zero warnings
- Check browser console — no JS errors, no 404s
- Test the golden path: grid loads → lightbox opens → prev/next/close → per-photo page loads
- Check mobile at 375px width and desktop at 1280px
- If touching the feed: verify `dist/feed.xml` has 15 entries and valid XML structure

---

## Common traps

**Changing a Glass slug breaks the URL**
The slug uses the first word of the Glass description. Change it → new slug → 404 for old links. To update display text without breaking the URL, edit the sidecar body — not the Glass description.

**Empty `overrideExif` fields fall back to source, not blank**
`overrideExif: { camera: "" }` restores the EXIF source value. `iso: 0` overrides with 0 — be explicit with numeric zeros.

**Auto-rename runs before the sidecar is read**
First build after dropping a new local photo: sidecar is created from EXIF, then the file is renamed. Two-step build is normal for new files — no data is lost.

**Glass cache TTL is 1 hour**
New Glass photos won't appear until the cache expires. Use `npm run build:fresh` or `npm run sync:glass` to force a re-fetch.

**Local photo URLs must be root-relative**
`/photos/filename.jpg` not `photos/filename.jpg` — they resolve from `/photos/YYYY-MM-DD-local-slug/` permalink pages.

**`overflow-x: hidden` on `<html>` breaks `position: fixed` on iOS Safari**
Applying it to `<html>` makes fixed children behave as `position: absolute`. Safe on `body`. Never add it to `html`.

**`calc(env() + px)` inside `linear-gradient` fails silently on iOS Safari**
Use `env()` directly as a gradient stop; put `calc(env() + px)` only in regular CSS properties like `height`. See `desk.css` `.fade-top` for the working pattern.

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
build/sources/glass.js Glass API, sidecar create/merge, sidecarUpdatedAt
build/sources/local.js Local processor, auto-rename, sidecarUpdatedAt
build/og-image.js      Monthly OG image (seeded PRNG, 6 templates)
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

- [ ] `npm run build` — zero errors, zero warnings
- [ ] `dist/` not committed
- [ ] Browser console clean — no JS errors, no 404s
- [ ] New local photos renamed (date-based stem) and sidecars auto-created
- [ ] `glass-sidecars/` has one file per Glass photo
- [ ] Gallery grid loads, masonry correct at desktop + mobile
- [ ] Lightbox opens (desktop: FLIP zoom; mobile: fade), prev/next/close, keyboard nav
- [ ] Lightbox close when card is off-screen: zoom-out fade (no squish/stretch)
- [ ] Infinite scroll loads next chunk when > 60 photos
- [ ] Per-photo pages load at `/photos/YYYY-MM-DD-{source}-{slug}/`
- [ ] View toggle widget visible bottom-right, all three buttons functional
- [ ] Grid ↔ stack switch persists across page reload
- [ ] Shuffle toggle randomises order on reload; toggling off restores date order
- [ ] Stack view: prev/next, keyboard ← →, and swipe all navigate
- [ ] Stack counter reads `N / Total` and updates as chunks load
- [ ] Card flip (postcard back) works in both grid and stack view
- [ ] Mobile: touch targets ≥ 44px, flip button visible without hover, swipe works
- [ ] `dist/feed.xml` present, opens cleanly, shows 15 entries

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

**Never tag content commits** — photo syncs, Glass sidecar edits, and `Chore: sync Glass` commits are not releases.

Move UNRELEASED entries in [CHANGELOG.md](CHANGELOG.md) to a dated version block on each release.
