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
`id` — and so the permalink `/photos/{id}/` — comes straight from the image's filename stem. `autoRename()` only touches filenames that aren't already "clean" (`isCleanStem()` in `build/utils/slug.js`), so once a file has been renamed once, editing its sidecar's `title:` afterward does *not* rename it again — safe. Manually renaming the image or sidecar file yourself is what breaks the URL. `local.js` looks a sidecar up strictly by the image's current stem (`sidecars/${stem}.md`), so renaming *only* the sidecar doesn't just fail to change the URL — it orphans the sidecar and the next build silently regenerates a blank one under the old name. To actually change a photo's slug, rename image + sidecar together with `npm run rename-photo -- <old-id> <new-id> --apply` (also updates any `series/*.md` reference) — still no redirect from the old URL.

**Empty EXIF sidecar fields fall back to source, not blank**
EXIF fields (`camera`, `lens`, `aperture`, etc.) are top-level sidecar properties, not nested — `camera: ""` restores the EXIF source value. `iso: 0` overrides with 0 — be explicit with numeric zeros.

**Auto-rename runs before any sidecar is read — a new photo needs a pre-existing sidecar to get a title-based slug**
On a photo's first build, `autoRename()` runs before `sidecarStub()` creates anything. If no sidecar already exists for the photo's raw filename stem, there's no `title:` to read yet, so it falls back to a timestamp-based stem (`YYYY-MM-DD-HHMMSS`) — permanently (see the renaming trap above). To get a clean slug on the first build, copy [TEMPLATE.md](TEMPLATE.md) into `sidecars/<raw-stem>.md` and fill in `title:` before dropping the photo into `local/`.

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

**R2 credentials that "connect fine" can still fail silently, or fail differently at each step**
`local/` is gitignored — since Glass retired, R2 is the *only* source of originals for CI, so a misconfigured bucket means CI builds with **zero photos** and still deploys successfully (no error — `downloadMissing()`'s failure is caught and only logged as a warning in `_data/photos.js`). Three distinct, easy-to-conflate failure modes:
- **Wrong bucket name** (e.g. using the site's display name instead of the actual R2 bucket name) → `Access Denied` on every call, even with a correctly-scoped, correctly-permissioned token.
- **List works, Get (download) doesn't, or vice versa** — R2 API tokens can end up authorized for one S3 operation but not another; a clean `ListObjectsV2` response with `object count: 0` only proves the bucket is reachable and empty, not that a subsequent `GetObject` will succeed once it has content.
- **A token that worked yesterday can be `401 Unauthorized` today** if it gets rotated/deleted later (e.g. as a "let's clean up now that I'm done" step) — nothing in the app changes, only the credential's validity did.
Local (`R2_BUCKET`/`R2_ENDPOINT_URL`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` exported in your shell for `npm run sync:r2`) and CI (`BUCKET_NAME`/`ENDPOINT_URL`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` repo secrets) **must reference the exact same bucket and the exact same token** — two different "working" tokens for the same bucket is a common way to end up debugging a phantom permissions mismatch that's actually just two different credentials being compared. If CI ever reports `Local: no images found in ./local` with no R2 log line above it, or an R2 error, don't assume "not configured" — verify the *actual* live bucket object count first (least effort: temporarily add a one-off script that just runs `ListObjectsV2` and logs the count, as a CI step or job — cheap in-place instrumentation using the real repo secrets beats guessing from outside).

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
scripts/rename-photo.js Rename a photo's image + sidecar + series refs together
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
- [ ] If `local/` originals changed or R2 credentials changed: confirm the R2 bucket actually has the expected object count (not just that a sync script reported success) *before* relying on a from-scratch CI build — CI deploying an empty gallery is a silent, non-failing outcome

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
