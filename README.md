# Memories

A static photography gallery for [@thedataareclean](https://glass.photo/thedataareclean). Pulls photos from [Glass.photo](https://glass.photo) and local files, builds with [Eleventy](https://www.11ty.dev/), deploys to GitHub Pages. No database, no server.

Every photo has a plain Markdown sidecar for editing title, description, tags, and EXIF overrides. Drop a photo in `local/`, edit its sidecar, run build — done.

---

## Quickstart

```sh
npm install
# Set your Glass username and site URL in config.js
npm run dev        # → http://localhost:3003
```

Full command reference: [COMMANDS.md](COMMANDS.md)

---

## Folder map

| Path | What's here |
|---|---|
| `config.js` | All site + build configuration |
| `_data/` | Data pipeline — fetches Glass, processes local, outputs JSON chunks |
| `_includes/` | Nunjucks layout shell |
| `src/` | Templates, styles, scripts, Atom feed |
| `build/` | Build-time modules: EXIF, watermark, OG image, sources |
| `scripts/` | CLI utilities: rename, Glass sync |
| `local/` | Drop photos here — auto-processed on build |
| `sidecars/` | One `.md` per photo (Glass + local both use it) — auto-created, edit freely |
| `series/` | One `.md` per series — title, description, cover photo, ordered photo list |
| `launchd/` | Weekly Glass sync + local photo auto-publish agents for macOS |
| `dist/` | Build output — not committed |

---

## Adding photos

**Local** (primary workflow) — drop image files into `local/`, or write directly in Obsidian (this repo doubles as the vault). On build: auto-renamed to `YYYY-MM-DD-slug.ext`, sidecar created in `sidecars/` with real EXIF pre-filled and the photo embedded inline, 800px thumbnail + 2400px display + watermarked download generated.

**Glass** (legacy — historic photos only, no longer actively posted to) — existing Glass photos keep working as before; set `glass.username` in `config.js` if you ever want to sync new ones.

---

## Photo metadata

Edit the sidecar `.md` file for any photo — EXIF fields are top-level properties (not nested), so each shows up as its own editable row in Obsidian's Properties panel:

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

![[2026-03-09-bougainvillea.jpg]]

Description shown in the lightbox and on the photo's permalink page.
```

Leave any EXIF field blank to fall back to what Glass or the photo's own EXIF provides. The `![[...]]` embed is optional — shows the photo inline while you write the caption in Obsidian, stripped out automatically before publishing.

---

## Docs

| File | Contents |
|---|---|
| [README.md](README.md) | This file — what it is, how to start |
| [APP.md](APP.md) | Architecture, data pipeline, design system, deploy model |
| [COMMANDS.md](COMMANDS.md) | All commands, copy-paste ready |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [FUTURE.md](FUTURE.md) | Ideas backlog |
| [CLAUDE.md](CLAUDE.md) | Operating instructions for Claude |
