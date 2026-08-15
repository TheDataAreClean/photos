# COMMANDS.md — Memories Gallery

All commands, copy-paste ready. See [CLAUDE.md](CLAUDE.md) for when to use each.

---

## Task table

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Build (force Glass re-fetch) | `npm run build:fresh` |
| Sync Glass API only | `npm run sync:glass` |
| Back up local/ originals to R2 | `npm run sync:r2` |
| Publish a note to Ghost | `npm run publish:ghost -- path/to/note.md` |
| Rename — dry run | `npm run rename` |
| Rename — apply | `npm run rename -- --apply` |
| Rename local photos only | `npm run rename:local` |
| Rename Glass sidecars only | `npm run rename:glass` |
| Regenerate favicon assets | `npm run gen:favicon` |
| Regenerate OG image | `npm run gen:og` |

---

## launchd (weekly Glass sync)

```sh
# Install
cp launchd/com.thedataareclean.photos-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.thedataareclean.photos-sync.plist

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.thedataareclean.photos-sync.plist
```

Runs `scripts/glass-sync.sh` every Sunday at 08:00. Logs to `~/Library/Logs/photos-sync.log`.

---

## Release tagging

```sh
git tag -a v1.2.3 -m "Brief description"
git push origin v1.2.3
```

Never tag content commits (photo syncs, sidecar edits). See [CHANGELOG.md](CHANGELOG.md) for version bump rules.

---

## Notes / prerequisites

- `SITE_URL` — set in CI (`deploy.yml`) and locally for correct absolute URLs in the feed and OG tags. Defaults to empty string if unset.
- `GLASS_TOKEN` — optional Glass API token; improves rate limits. Set via env var or CI secret.
- `npm run gen:og` requires a prior build (`dist/data/photos-1.json` must exist).
- `npm run rename:glass` injects `glassAutoId` into sidecar frontmatter before renaming — do not run it on files that already have a `glassAutoId`.
- `GHOST_API_URL` / `GHOST_ADMIN_API_KEY` — required for `npm run publish:ghost`. Create a Custom Integration in Ghost Admin → Settings → Integrations to get the Admin API key (`id:secret` format) and confirm the site URL. Set as env vars, never committed.
- `R2_BUCKET` / `R2_ENDPOINT_URL` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — required for `npm run sync:r2` and for CI to fetch originals during build. Missing/unset means both no-op silently (local dev without R2 still works). In CI these map from the `BUCKET_NAME` / `ENDPOINT_URL` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` repo secrets (see `deploy.yml`).
