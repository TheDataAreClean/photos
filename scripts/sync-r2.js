#!/usr/bin/env node
/**
 * sync-r2.js
 *
 * Backs up any new photo in local/ to the private Cloudflare R2 bucket.
 * R2 is the durable backup and the source CI builds from — local/ itself
 * is gitignored and never reaches a fresh checkout.
 *
 * Run manually, or on a schedule (see launchd/), with:
 *
 *   npm run sync:r2
 */
'use strict';

const config = require('../config');
const { uploadNew } = require('../build/sources/r2');

uploadNew(config)
  .then(({ uploaded }) => {
    console.log(`✓ R2 sync: ${uploaded} new file(s) uploaded`);
  })
  .catch(err => {
    console.error(`✗ R2 sync failed: ${err.message}`);
    process.exit(1);
  });
