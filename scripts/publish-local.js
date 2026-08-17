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

const fs     = require('fs');
const { execSync } = require('child_process');
const path   = require('path');
const matter = require('gray-matter');
const config = require('../config');
const { uploadNew } = require('../build/sources/r2');

const PROJECT_DIR   = path.resolve(__dirname, '..');
const SIDECARS_DIR  = path.resolve(PROJECT_DIR, config.local.sidecarsDir);
// Relative, forward-slash pathspec for git commands (e.g. "sidecars") —
// derived from config so it can never drift from SIDECARS_DIR above.
const SIDECARS_PATHSPEC = path.relative(PROJECT_DIR, SIDECARS_DIR).split(path.sep).join('/');

function run(cmd) {
  return execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8' });
}

// Pre-flight: every staged sidecar must still be valid, parseable
// frontmatter before we commit+push straight to main and trigger a live
// deploy. Mirrors the validation the old publish-ghost.js did (it refused
// to publish anything missing required fields) — this script had none.
function validateStagedSidecars() {
  const staged = run(`git diff --cached --name-only -- ${SIDECARS_PATHSPEC}`)
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.endsWith('.md'));

  const errors = [];
  for (const relPath of staged) {
    const fullPath = path.join(PROJECT_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue; // staged deletion — nothing to validate
    try {
      const parsed = matter(fs.readFileSync(fullPath, 'utf8'));
      if (typeof parsed.data !== 'object' || parsed.data === null) {
        errors.push(`${relPath}: frontmatter did not parse to an object`);
      }
    } catch (err) {
      errors.push(`${relPath}: invalid YAML frontmatter — ${err.message}`);
    }
  }

  if (errors.length) {
    throw new Error(`Refusing to publish — malformed sidecar(s):\n  ${errors.join('\n  ')}`);
  }
}

async function main() {
  const { uploaded } = await uploadNew(config);
  console.log(`✓ R2: ${uploaded} new original(s) uploaded`);

  run(`git add ${SIDECARS_PATHSPEC}/`);

  let hasChanges = true;
  try {
    run(`git diff --cached --quiet -- ${SIDECARS_PATHSPEC}`);
    hasChanges = false;
  } catch {
    // non-zero exit means there IS a staged diff under sidecars/
  }

  if (!hasChanges) {
    console.log('✓ Nothing new to commit — captions unchanged');
    return;
  }

  validateStagedSidecars();

  // Only commit changes under sidecars/, even if other files are staged
  // elsewhere in the repo at the same time (e.g. unrelated WIP on this
  // machine) — the pathspec restricts the commit to exactly what this
  // script staged, regardless of what else sits in the index.
  run(`git commit -m "Chore: sync local photo captions" -- ${SIDECARS_PATHSPEC}`);

  // Rebase onto the latest origin/main before pushing — deploy.yml pushes
  // its own auto-sync commits back to main after every build this script
  // triggers, so main can have moved since we last read it.
  try {
    run('git pull --rebase origin main');
  } catch (err) {
    throw new Error(`Rebase onto origin/main failed, not pushing: ${err.message}`);
  }

  try {
    run('git push origin main');
  } catch (err) {
    // One retry: the rebase above closes most races, but origin/main can
    // still move in the gap between the rebase and this push.
    console.warn('  Push rejected, retrying once after re-rebasing...');
    run('git pull --rebase origin main');
    run('git push origin main');
  }

  console.log('✓ Pushed — deploy will pick this up automatically');
}

main().catch(err => {
  console.error(`✗ publish-local failed: ${err.message}`);
  process.exit(1);
});
