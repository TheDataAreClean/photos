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
| Rename one photo's slug (image + sidecar + series refs together) — dry run | `npm run rename-photo -- <old-id> <new-id>` |
| Rename one photo's slug — apply | `npm run rename-photo -- <old-id> <new-id> --apply` |
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

# Force a run right now instead of waiting for the next 20-min interval
launchctl kickstart -k gui/$(id -u)/com.thedataareclean.photos-local-sync
```

Runs `scripts/local-sync.sh` → `npm run publish:local` every 20 minutes (and once immediately on load). Backs up any new `local/` originals to R2, then commits + pushes `sidecars/` if any changed — the push triggers the normal CI build/deploy. Only ever touches `sidecars/`, never anything else in the repo. Logs to `~/Library/Logs/photos-local-sync.log`.

**Requires, after copying the plist to `~/Library/LaunchAgents/`, before it's actually functional:**
- **R2 credentials, filled into the *installed* copy's `EnvironmentVariables` block** (`R2_BUCKET`/`R2_ENDPOINT_URL`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) — `launchd` does not inherit your interactive shell's `export`s. Leaving the block absent entirely, the agent skips the R2 backup step cleanly (`R2: not configured`) and still commits+pushes sidecar changes. Leaving the checked-in `REPLACE_ME` placeholders *in place* is different and worse — they're non-empty strings, so the agent treats R2 as configured, tries to use `REPLACE_ME` as a real endpoint, and fails (caught and logged as a warning as of the `publish-local.js` fix, but still means R2 backup silently never runs). Fill in real values or leave the block out — never leave placeholders in an installed copy. Never commit real values to the checked-in template. After editing the installed copy, `launchctl unload` + `launchctl load` again to pick up the change (editing the file alone doesn't reload a running agent).
- **Full Disk Access for `/bin/bash` and `node`** (System Settings → Privacy & Security → Full Disk Access) — macOS blocks unattended/`launchd` processes from reading `~/Documents` by default, even though your interactive Terminal can access it fine. Without this the log shows `getcwd: cannot access parent directories: Operation not permitted` and the script never even starts.
- **git push access to work non-interactively** (an SSH key without a passphrase prompt, or a cached credential helper) — the same credentials you already use for manual `git push` from this Mac.

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
  - **These must be the exact same bucket + token as the GitHub repo secrets** — a `sync:r2` that reports success against the wrong bucket, or a token that only has some of the permissions the pipeline needs, both look identical from the terminal ("no error") until CI tries to actually use what's (or isn't) in the bucket. Since `local/` is gitignored, R2 is CI's *only* source of originals — an empty or wrong bucket means CI silently deploys a zero-photo site with no build failure. See "R2 credentials..." in [CLAUDE.md](CLAUDE.md)'s Common traps.
  - When setting these up for the first time (or after any credential change), confirm with an actual object count in the bucket — via the Cloudflare dashboard, or a one-off `ListObjectsV2` script run as a CI step using the real repo secrets — not just "the command didn't error."
