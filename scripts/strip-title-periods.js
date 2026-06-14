#!/usr/bin/env node
// One-time: strip trailing periods from older auto-generated titles.
// Pre-v2.0.0, title defaulted to the first word of the Glass description
// (incl. trailing "."). v2.0.0 changed this to the text before the first
// period, so newer titles have no trailing period. This brings the older
// sidecars in line — only touches single-period titles (no internal dots,
// so abbreviations like "Mr." are untouched).

const fs = require('fs');
const path = require('path');

const SIDECARS_DIR = path.join(__dirname, '..', 'glass-sidecars');

const TITLE_RE = /^title: "([^".]+)\.\"$/m;

let changed = 0;
for (const file of fs.readdirSync(SIDECARS_DIR)) {
  if (!file.endsWith('.md')) continue;
  const filePath = path.join(SIDECARS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(TITLE_RE);
  if (!match) continue;

  const updated = content.replace(TITLE_RE, `title: "${match[1]}"`);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`${file}: "${match[1]}." -> "${match[1]}"`);
  changed++;
}

console.log(`\nUpdated ${changed} sidecar(s).`);
