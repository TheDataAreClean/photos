# Memories

A static photography gallery for @thedataareclean. Builds with [Eleventy](https://www.11ty.dev/), deploys to GitHub Pages. No database, no server.

Every photo has a plain Markdown sidecar for editing title, description, tags, and EXIF overrides. Drop a photo in `local/`, edit its sidecar, run build — done.

---

## Quickstart

```sh
npm install
# Set your site URL in config.js
npm run dev        # → http://localhost:3003
```

Full command reference: [COMMANDS.md](COMMANDS.md)

---

## Folder map

| Path | What's here |
|---|---|
| `config.js` | All site + build configuration |
| `_data/` | Data pipeline — processes photos, outputs JSON chunks |
| `_includes/` | Nunjucks layout shell |
| `src/` | Templates, styles, scripts, Atom feed |
| `src/admin/` | Sveltia CMS — web editor for sidecars/series at `/admin` |
| `build/` | Build-time modules: EXIF, watermark, OG image, sources |
| `scripts/` | CLI utilities: rename, R2 sync/publish |
| `test/` | `node --test` unit tests for pure logic (slug, sidecar, EXIF backfill) |
| `local/` | Drop photos here — auto-processed on build |
| `sidecars/` | One `.md` per photo — auto-created, edit freely |
| `series/` | One `.md` per series — title, description, cover photo, ordered photo list |
| `launchd/` | Local photo auto-publish agent for macOS |
| `dist/` | Build output — not committed |

---

## Adding photos

Drop image files into `local/`. On build: auto-renamed to `YYYY-MM-DD-slug.ext`, sidecar created in `sidecars/` with real EXIF pre-filled and the photo embedded inline, 800px thumbnail + 2400px display + watermarked download generated.

To get a clean title-based slug on the first build instead of a timestamp, copy [TEMPLATE.md](TEMPLATE.md) into `sidecars/<raw-filename-stem>.md` and fill in `title:` before dropping the photo in.

---

## Photo metadata

Edit the sidecar `.md` file for any photo — EXIF fields are top-level properties, not nested:

```markdown
---
title: "Bougainvillea."
camera: "Fujifilm X-T50"
lens: "XF23mmF2 R WR"
focalLength: "23mm"
focalLength35: "35mm"
aperture: "ƒ/2.8"
shutterSpeed: "1/250s"
iso: 400
dateTaken: "2026-03-09T08:57:02Z"
---

![](../local/2026-03-09-bougainvillea.jpg)

Description shown in the lightbox and on the photo's permalink page.
```

Leave any EXIF field blank to fall back to the photo's own EXIF. The `![](../local/...)` embed is optional — shows the photo inline in any Markdown-aware editor while you write the caption, stripped out automatically before publishing.

---

## Docs

| File | Contents |
|---|---|
| [README.md](README.md) | This file — what it is, how to start |
| [APP.md](APP.md) | Architecture, data pipeline, design system, deploy model |
| [COMMANDS.md](COMMANDS.md) | All commands, copy-paste ready |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [FUTURE.md](FUTURE.md) | Ideas backlog |
| [TEMPLATE.md](TEMPLATE.md) | Blank sidecar frontmatter — copy into `sidecars/` to pre-caption a photo before it exists |
| [CLAUDE.md](CLAUDE.md) | Operating instructions for Claude |
