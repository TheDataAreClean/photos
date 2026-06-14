#!/usr/bin/env node
// One-off sweep: compare each sidecar's description body against the
// current Glass description (after stripping the auto-generated title
// prefix), to find sidecars that have drifted from edits made on Glass.

const fs     = require('fs');
const path   = require('path');
const matter = require('gray-matter');
const { toSlug, dateTitleStem } = require('../build/utils/slug');

const SIDECARS_DIR = path.resolve('glass-sidecars');
const raw = JSON.parse(fs.readFileSync('.cache/glass-raw.json', 'utf8'));

// Build glassAutoId -> filepath map
const autoIdMap = new Map();
for (const file of fs.readdirSync(SIDECARS_DIR)) {
  if (!file.endsWith('.md')) continue;
  const fp = path.join(SIDECARS_DIR, file);
  const parsed = matter(fs.readFileSync(fp, 'utf8'));
  if (parsed.data?.glassAutoId) autoIdMap.set(parsed.data.glassAutoId, fp);
}

let driftCount = 0;

for (const p of raw) {
  const descSnippet = (p.description || '').trim().split(/[.\n]/)[0].trim();
  const dateStr  = p.exif?.date_time_original || p.created_at || null;
  const date     = dateStr ? new Date(dateStr) : null;
  const stem     = date ? dateTitleStem(date, descSnippet) : toSlug(p.id);
  const datePart = stem.slice(0, 10);
  const rest     = stem.slice(11);
  const id       = rest ? `${datePart}-glass-${rest}` : `${datePart}-glass`;

  const directPath = path.join(SIDECARS_DIR, `${id}.md`);
  const sidecarPath = fs.existsSync(directPath) ? directPath : autoIdMap.get(id);
  if (!sidecarPath) {
    console.log(`NO SIDECAR for ${id} (glass id ${p.id})`);
    continue;
  }

  const sidecar = matter(fs.readFileSync(sidecarPath, 'utf8'));
  const sidecarBody = (sidecar.content || '').trim();

  let expectedBody = (p.description || '').trim().replace(/^\S+\s*/, '').trim();
  // Series numbering line (e.g. "#12.") is redundant with the title and
  // often dropped from the sidecar body intentionally — strip it from the
  // expected text too so that omission isn't flagged as drift.
  const expectedBodyNoSeriesNum = expectedBody.replace(/^#\d+\.?\s*\n*/, '').trim();

  // Skip legacy single-word-description sidecars: current SIDECAR_STUB
  // strips a lone "word." description down to an empty body, but older
  // sidecars kept it as the body — not a real Glass edit, just a format
  // difference. Only flag when there's actual divergent text on both sides,
  // or Glass added body text that's missing from the sidecar entirely.
  if (!expectedBody && sidecarBody) continue;
  if (sidecarBody === expectedBodyNoSeriesNum) continue;

  if (sidecarBody !== expectedBody) {
    driftCount++;
    const file = path.basename(sidecarPath);
    console.log(`\n=== DRIFT: ${file} ===`);
    console.log('--- Glass (current) ---');
    console.log(expectedBody);
    console.log('--- Sidecar (current) ---');
    console.log(sidecarBody);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::warning file=glass-sidecars/${file}::Description on Glass differs from the sidecar body — review and update manually if the Glass edit should win.`);
    }
  }
}

console.log(`\n${driftCount} sidecar(s) with description drift out of ${raw.length} Glass photos.`);
