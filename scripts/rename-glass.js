#!/usr/bin/env node
/**
 * rename-glass.js
 *
 * Preview or apply clean renames for glass sidecar files.
 * For each sidecar that has a title, derives the ideal slug from that title
 * and renames the file if it doesn't already match.
 *
 * Before renaming a file that has no glassAutoId, the script injects one
 * pointing at the current stem — so the build can still match the sidecar
 * back to the Glass API data after the rename.
 *
 * Usage:
 *   npm run rename:glass            # preview only
 *   npm run rename:glass -- --apply # rename for real
 */
'use strict';

const fs   = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');
const { toSlug } = require('../build/utils/slug');

const SIDECARS_DIR = path.resolve(__dirname, '../glass-sidecars');
const DRY_RUN      = !process.argv.includes('--apply');

async function main() {
  let entries;
  try {
    entries = await fs.readdir(SIDECARS_DIR);
  } catch {
    console.log('glass-sidecars/ directory not found.');
    return;
  }

  const files = entries.filter(f => f.endsWith('.md'));
  if (!files.length) { console.log('No glass sidecar files found.'); return; }

  const plan = [];

  for (const filename of files) {
    const filepath = path.join(SIDECARS_DIR, filename);
    const raw      = await fs.readFile(filepath, 'utf8');
    const parsed   = matter(raw);
    const { title, glassAutoId } = parsed.data || {};

    // No title → can't derive a better slug, skip
    if (!title || !title.trim()) continue;

    const stem = path.parse(filename).name;

    // Must match YYYY-MM-DD-glass-<slug>
    const m = stem.match(/^(\d{4}-\d{2}-\d{2})-glass-(.+)$/);
    if (!m) continue;

    const [, datePart, currentSlug] = m;
    const idealSlug = toSlug(title.trim());

    if (!idealSlug || currentSlug === idealSlug) continue; // already clean

    const newStem = `${datePart}-glass-${idealSlug}`;
    const newFile = `${newStem}.md`;

    // Collision check — skip if target already exists
    const targetPath = path.join(SIDECARS_DIR, newFile);
    const collision  = await fs.access(targetPath).then(() => true).catch(() => false);
    if (collision) {
      console.warn(`  Skipping ${filename}: target ${newFile} already exists`);
      continue;
    }

    plan.push({ filename, newFile, stem, newStem, filepath, raw, glassAutoId });
  }

  if (!plan.length) {
    console.log('All glass sidecar filenames already clean.');
    return;
  }

  console.log(DRY_RUN
    ? '── Dry run (pass --apply to rename) ──\n'
    : '── Renaming ──\n'
  );

  for (const { filename, newFile, stem, filepath, raw, glassAutoId } of plan) {
    const needsId = !glassAutoId;
    console.log(`  ${filename}  →  ${newFile}${needsId ? '  (+glassAutoId)' : ''}`);

    if (!DRY_RUN) {
      // If no glassAutoId, inject it after the opening --- so build can still find this sidecar
      let content = raw;
      if (needsId) {
        content = content.replace(/^---\n/, `---\nglassAutoId: "${stem}"\n`);
        await fs.writeFile(filepath, content, 'utf8');
      }
      await fs.rename(filepath, path.join(SIDECARS_DIR, newFile));
    }
  }

  console.log('\n' + (DRY_RUN
    ? `${plan.length} file(s) would be renamed. Run with --apply to proceed.`
    : `✓ ${plan.length} file(s) renamed.`
  ));
}

main().catch(err => { console.error(err); process.exit(1); });
