# COMMANDS.md — Memories Gallery

All commands, copy-paste ready. See [CLAUDE.md](CLAUDE.md) for when to use each.

---

## Task table

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Run tests | `npm test` |
| Back up local/ originals to R2 | `npm run sync:r2` |
| Back up + commit + push local/ (full auto-publish) | `npm run publish:local` |
| Rename — dry run | `npm run rename` |
| Rename — apply | `npm run rename -- --apply` |
| Regenerate favicon assets | `npm run gen:favicon` |
| Regenerate OG image | `npm run gen:og` |

---

## launchd (local photo auto-publish, every 20 min)

```sh
# Install
cp launchd/com.thedataareclean.photos-local-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.thedataareclean.photos-local-sync.plist

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.thedataareclean.photos-local-sync.plist
```

Runs `scripts/local-sync.sh` → `npm run publish:local` every 20 minutes (and once immediately on load). Backs up any new `local/` originals to R2, then commits + pushes `sidecars/` if any changed — the push triggers the normal CI build/deploy. Only ever touches `sidecars/`, never anything else in the repo. Logs to `~/Library/Logs/photos-local-sync.log`.

**Requires:** git push access to work non-interactively (an SSH key without a passphrase prompt, or a cached credential helper) — the same credentials you already use for manual `git push` from this Mac.

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
- `npm run gen:og` requires a prior build (`dist/data/photos-1.json` must exist).
- `R2_BUCKET` / `R2_ENDPOINT_URL` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — required for `npm run sync:r2` and for CI to fetch originals during build. Missing/unset means both no-op silently (local dev without R2 still works). In CI these map from the `BUCKET_NAME` / `ENDPOINT_URL` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` repo secrets (see `deploy.yml`).
