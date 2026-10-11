#!/usr/bin/env node
// Monthly OG image for the EmDash site, using the Eleventy build's own
// build/og-image.js (same templates, same monthly seed). It needs
// @napi-rs/canvas, which can't run on Workers, so this runs before
// `astro build` (CI, monthly) and writes public/og-image.jpg.
//
//   node scripts/gen-og-image.mjs                 # photos from SITE_URL
//   SITE_URL=http://localhost:4321 node scripts/gen-og-image.mjs
//
// Needs the repo root's dependencies (`npm ci` in ..). Never fails the build:
// with no photos reachable it keeps whatever og-image.jpg is already there.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUBLIC = path.resolve(HERE, "../public");
const SITE_URL = (process.env.SITE_URL || "https://photos.thedataareclean.com").replace(/\/$/, "");

async function loadPhotos() {
	const photos = [];
	for (let n = 1; ; n++) {
		const res = await fetch(`${SITE_URL}/data/photos-${n}.json`);
		if (!res.ok) break;
		photos.push(...(await res.json()));
	}
	// og-image.js fetches absolute display URLs itself.
	return photos.map((p) => ({ ...p, url: { ...p.url, display: SITE_URL + p.url.display } }));
}

try {
	const photos = await loadPhotos();
	process.chdir(ROOT); // og-image.js caches fonts under ./.cache
	const { generateOgImage } = require(path.join(ROOT, "build/og-image.js"));
	await generateOgImage(photos, PUBLIC);
} catch (err) {
	console.warn(`  OG image: skipped — ${err.message}`);
}
