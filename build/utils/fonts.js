'use strict';

// Shared font-fetching helpers — used by both gen-watermark.js and og-image.js,
// which each need a local Schoolbell TTF for @napi-rs/canvas.
//
// Google Fonts CSS v1 API no longer returns .ttf URLs for most families — the
// dynamic fonts.gstatic.com URL it returns now has no file extension, so any
// regex matching `.ttf` silently fails. Match any fonts.gstatic.com URL instead.
// Primary source is the stable google/fonts GitHub repo; gstatic is fallback only.

const https = require('https');
const http  = require('http');
const fs    = require('fs/promises');
const path  = require('path');

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(fetchBuffer(res.headers.location, headers));
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Ensures a Schoolbell TTF exists at destPath, downloading it if needed.
// Returns destPath on success, or null if both sources failed.
async function ensureSchoolbell(destPath) {
  if (await fileExists(destPath)) return destPath;

  await fs.mkdir(path.dirname(destPath), { recursive: true });

  try {
    const buf = await fetchBuffer(
      'https://github.com/google/fonts/raw/main/apache/schoolbell/Schoolbell-Regular.ttf'
    );
    await fs.writeFile(destPath, buf);
    return destPath;
  } catch { /* fall through to gstatic */ }

  try {
    const css = (await fetchBuffer(
      'https://fonts.googleapis.com/css?family=Schoolbell',
      { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' }
    )).toString();
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (match) {
      const buf = await fetchBuffer(match[1]);
      await fs.writeFile(destPath, buf);
      return destPath;
    }
  } catch { /* ignore */ }

  return null;
}

module.exports = { fetchBuffer, fileExists, ensureSchoolbell };
