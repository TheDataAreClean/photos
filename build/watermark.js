'use strict';

const fs    = require('fs/promises');
const path  = require('path');
const https = require('https');
const http  = require('http');
const sharp = require('sharp');

const WM_PNG = path.resolve('build/assets/watermark.png');

// Cached per build-process lifetime — both are constant
let _wmReady = false;
let _wmMeta  = null;

async function ensureWatermark() {
  if (_wmReady) return;
  try {
    await fs.access(WM_PNG);
  } catch {
    console.log('  Watermark: generating PNG…');
    await require('./gen-watermark.js');
  }
  _wmMeta  = await sharp(WM_PNG).metadata();
  _wmReady = true;
}

// ── Apply watermark to a Buffer, return Buffer ────────
// Scales the watermark PNG to ~18% of the image width and
// places it in the bottom-right corner with a small margin.
async function applyWatermark(inputBuf) {
  await ensureWatermark();

  const meta  = await sharp(inputBuf).metadata();
  const imgW  = meta.width;
  const imgH  = meta.height;

  const targetW   = Math.round(imgW * 0.18);
  const targetH   = Math.round((_wmMeta.height / _wmMeta.width) * targetW);
  const margin    = Math.round(imgW * 0.018);

  const wmResized = await sharp(WM_PNG)
    .resize(targetW, targetH)
    .toBuffer();

  return sharp(inputBuf)
    .composite([{
      input: wmResized,
      left:  imgW - targetW - margin,
      top:   imgH - targetH - margin,
    }])
    .toBuffer();
}

// ── HTTP helper ───────────────────────────────────────
function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(fetchBuffer(res.headers.location, headers));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300)
          return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        resolve(Buffer.concat(chunks));
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { applyWatermark, fetchBuffer };
