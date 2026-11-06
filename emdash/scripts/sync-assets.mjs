#!/usr/bin/env node
// Copies the gallery's front-end into public/ so the Eleventy site's
// src/styles, src/scripts and src/images stay the single source of truth:
// one set of design tokens and scripts for both sites. Runs before dev and
// build (predev / prebuild); public/'s copies are gitignored.
//
// Then overlay/ is laid on top: files only the EmDash site needs
// (overlay/scripts/editor-links.js, the signed-in Edit button).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src");
const OVERLAY = path.resolve(HERE, "../overlay");
const PUBLIC = path.resolve(HERE, "../public");

const copyDir = (from, to) => fs.cp(from, to, { recursive: true, force: true });

await fs.mkdir(PUBLIC, { recursive: true });
for (const dir of ["styles", "scripts", "images"]) {
	await fs.rm(path.join(PUBLIC, dir), { recursive: true, force: true });
	await copyDir(path.join(SRC, dir), path.join(PUBLIC, dir));
}
// The favicons live at the site root, as on the Eleventy site.
for (const f of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
	await fs.copyFile(path.join(SRC, "images", f), path.join(PUBLIC, f));
}
await fs.rm(path.join(PUBLIC, "images"), { recursive: true, force: true });
await copyDir(path.join(SRC, "images"), path.join(PUBLIC, "images"));
await fs.copyFile(path.join(SRC, "robots.txt"), path.join(PUBLIC, "robots.txt"));
await copyDir(OVERLAY, PUBLIC);
console.log("  assets: synced ../src → public/");
