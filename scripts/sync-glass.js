#!/usr/bin/env node
/**
 * sync-glass.js
 *
 * Lightweight Glass sync — fetches fresh data from the Glass API and updates
 * the local cache and sidecar stubs without running a full Eleventy build.
 *
 * Intended to be run on a weekly schedule (see launchd/com.thedataareclean.photos-sync.plist).
 * Run manually at any time with:
 *
 *   npm run sync:glass
 *
 * The next `npm run build` will pick up the refreshed cache automatically.
 */
'use strict';

const config     = require('../config');
const { fetchGlass } = require('../build/sources/glass');

const start = Date.now();

fetchGlass(config, /* fresh= */ true)
  .then(photos => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ Glass synced: ${photos.length} photos in ${elapsed}s`);
  })
  .catch(err => {
    console.error(`✗ Glass sync failed: ${err.message}`);
    process.exit(1);
  });
