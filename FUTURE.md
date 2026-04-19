# FUTURE.md — Ideas backlog

Unshipped ideas only. No commands, no architecture, no completed items.

---

## NOW

Nothing urgent.

---

## NEXT

**Sveltia CMS for sidecar editing — edit captions and tags through a browser UI**
Sveltia CMS (Git-backed, open source) can manage the `glass-sidecars/` and `local/` `.md` files directly via the GitHub API. Scoped to metadata editing only — keep the local photo ingestion pipeline as-is. Small config, no new infrastructure. Skip photo upload via CMS (raw binaries in Git + pipeline rename conflicts make it messy).

---

## LATER

**Smaller chunk size (30 instead of 60)**
Faster first-chunk inline paint. Trade-off: doubles JSON requests for the same total photo count. Only worth evaluating once total photo count consistently exceeds 60 and scroll performance becomes noticeable.

**Tag pages**
Render a filtered gallery per tag (e.g. `/tags/street/`). Tags are already stored on the photo object. Needs: tag index page, filtered photo arrays per tag, nav links. Moderate scope — Eleventy pagination handles the page generation cleanly.
