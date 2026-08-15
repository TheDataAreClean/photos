#!/usr/bin/env node
/**
 * publish-local.js
 *
 * The automated half of the Obsidian → live loop: backs up any new local/
 * originals to R2, then commits + pushes any new/changed sidecars/ files
 * (captions) so the push triggers the existing deploy.yml build.
 *
 * Only ever touches sidecars/ — never `git add`s anything else, so it can't
 * sweep up unrelated in-progress work in the repo.
 *
 * Run manually with `npm run publish:local`, or on a schedule via
 * launchd (see launchd/com.thedataareclean.photos-local-sync.plist).
 */
'use strict';

const { execSync } = require('child_process');
const path   = require('path');
const config = require('../config');
const { uploadNew } = require('../build/sources/r2');

const PROJECT_DIR = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8' });
}

async function main() {
  const { uploaded } = await uploadNew(config);
  console.log(`✓ R2: ${uploaded} new original(s) uploaded`);

  run('git add sidecars/');

  let hasChanges = true;
  try {
    run('git diff --cached --quiet');
    hasChanges = false;
  } catch {
    // non-zero exit means there IS a staged diff
  }

  if (!hasChanges) {
    console.log('✓ Nothing new to commit — captions unchanged');
    return;
  }

  run(`git commit -m "Chore: sync local photo captions"`);
  run('git push origin main');
  console.log('✓ Pushed — deploy will pick this up automatically');
}

main().catch(err => {
  console.error(`✗ publish-local failed: ${err.message}`);
  process.exit(1);
});
