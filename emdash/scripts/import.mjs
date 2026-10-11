#!/usr/bin/env node
// Import the Eleventy site's photos and series into a running EmDash dev server.
//
//   npm run dev                      # in another terminal; finish /_emdash/admin setup first
//   npm run import                   # originals from ../local
//   npm run import -- --local ~/path/to/originals
//   npm run import -- --placeholder  # no originals at hand: grey stand-ins
//
// Reads ../sidecars/*.md and ../series/*.md. Each original becomes the same
// three files the upload widget makes: a 2400px display JPEG, a watermarked
// copy for downloads (build/watermark.js placement) and an 800px WebP
// thumbnail. Re-encoding drops all EXIF, including GPS. Originals never leave the Mac.
// Safe to re-run: photos and series whose slug already exists are skipped.

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmDashClient } from "emdash/client";
import matter from "gray-matter";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE_URL = opt("url", "http://localhost:4321");
const LOCAL_DIR = path.resolve(opt("local", path.join(ROOT, "local")).replace(/^~/, os.homedir()));
const PLACEHOLDER = flag("placeholder");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".avif"];

const { stripImageEmbeds } = require(path.join(ROOT, "build/utils/sidecar.js"));

const client = new EmDashClient({ baseUrl: BASE_URL, devBypass: true });

// Markdown-ish caption → Portable Text: one block per blank-line paragraph,
// single newlines kept inside the text (soft breaks), as the sidecar had them.
let keySeq = 0;
const key = () => `k${(keySeq++).toString(36)}`;
const toPortableText = (text) =>
	String(text ?? "")
		.trim()
		.split(/\n{2,}/)
		.filter((p) => p.trim())
		.map((p) => ({
			_type: "block",
			_key: key(),
			style: "normal",
			markDefs: [],
			children: [{ _type: "span", _key: key(), text: p, marks: [] }],
		}));

const blank = (v) => v === undefined || v === null || v === "";
const slugify = (s) =>
	String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-");

async function findOriginal(stem) {
	for (const ext of IMAGE_EXTS) {
		for (const e of [ext, ext.toUpperCase()]) {
			const p = path.join(LOCAL_DIR, stem + e);
			try {
				await fs.access(p);
				return p;
			} catch {}
		}
	}
	return null;
}

// Same placement as build/watermark.js (18% of width, bottom-right, 1.8% margin),
// using the same build/assets/watermark.png.
const WM_PNG = path.join(ROOT, "build/assets/watermark.png");
async function applyWatermark(buf) {
	const { width, height } = await sharp(buf).metadata();
	const wm = sharp(WM_PNG);
	const wmMeta = await wm.metadata();
	const w = Math.round(width * 0.18);
	const h = Math.round((wmMeta.height / wmMeta.width) * w);
	const margin = Math.round(width * 0.018);
	const resized = await wm.resize(w, h).toBuffer();
	return sharp(buf).composite([{ input: resized, left: width - w - margin, top: height - h - margin }]).toBuffer();
}

async function prepareImage(stem, label) {
	const original = await findOriginal(stem);
	let display;
	if (original) {
		display = await sharp(original).rotate().resize({ width: 2400, withoutEnlargement: true }).toBuffer();
	} else if (PLACEHOLDER) {
		const shade = 60 + (stem.length * 17) % 80;
		display = await sharp({
			create: { width: 1600, height: 1067, channels: 3, background: { r: shade, g: shade - 10, b: shade - 25 } },
		})
			.composite([{ input: Buffer.from(`<svg width="1600" height="1067"><text x="50%" y="50%" font-size="64" text-anchor="middle" fill="#ddd6cc" font-family="sans-serif">${label.replace(/[<&]/g, "")}</text></svg>`) }])
			.png()
			.toBuffer();
	} else {
		return null;
	}
	// toBuffer() without withMetadata() writes no EXIF/GPS.
	const jpeg = (buf) => sharp(buf).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
	return {
		display: await jpeg(display),
		download: await jpeg(await applyWatermark(display)),
		thumb: await sharp(display).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
	};
}

async function existingSlugs(collection) {
	const slugs = new Map();
	for await (const item of client.listAll(collection)) slugs.set(item.slug, item.id);
	return slugs;
}

async function ensureTags(names) {
	const have = new Set();
	try {
		const { items } = await client.terms("tag", { limit: 1000 });
		for (const t of items) have.add(t.slug);
	} catch {}
	for (const name of names) {
		const slug = slugify(name);
		if (!slug || have.has(slug)) continue;
		await client.createTerm("tag", { slug, label: name });
		have.add(slug);
	}
}

async function importPhotos() {
	const files = (await fs.readdir(path.join(ROOT, "sidecars"))).filter((f) => f.endsWith(".md")).sort();
	const existing = await existingSlugs("photos");
	const ids = new Map(existing);
	const allTags = new Set();
	const parsed = [];
	for (const f of files) {
		const stem = f.slice(0, -3);
		const { data, content } = matter(await fs.readFile(path.join(ROOT, "sidecars", f), "utf8"));
		parsed.push({ stem, data, caption: stripImageEmbeds(content) || "" });
		for (const t of data.tags || []) if (!blank(t)) allTags.add(String(t));
	}
	await ensureTags([...allTags]);

	let created = 0, skipped = 0, missing = [];
	for (const { stem, data, caption } of parsed) {
		if (existing.has(stem)) { skipped++; continue; }
		const title = blank(data.title) ? null : String(data.title);
		const alt = title ?? stem.replace(/-/g, " ");
		const files = await prepareImage(stem, alt);
		if (!files) { missing.push(stem); continue; }

		const [media, download, thumb] = await Promise.all([
			client.mediaUpload(files.display, `${stem}.jpg`, { alt, contentType: "image/jpeg" }),
			client.mediaUpload(files.download, `${stem}-download.jpg`, { alt, contentType: "image/jpeg" }),
			client.mediaUpload(files.thumb, `${stem}@800.webp`, { alt, contentType: "image/webp" }),
		]);
		const dateTaken = blank(data.dateTaken) ? null : new Date(data.dateTaken).toISOString();
		const item = await client.create("photos", {
			slug: stem,
			data: {
				image: {
					provider: "local",
					id: media.id,
					alt,
					width: media.width,
					height: media.height,
					mimeType: media.mimeType,
					filename: media.filename,
					meta: {
						storageKey: media.storageKey,
						variants: {
							download: { id: download.id, storageKey: download.storageKey },
							thumb: { id: thumb.id, storageKey: thumb.storageKey },
						},
					},
				},
				title,
				caption: toPortableText(caption),
				date_taken: dateTaken,
				camera: blank(data.camera) ? null : String(data.camera),
				lens: blank(data.lens) ? null : String(data.lens),
				focal_length: blank(data.focalLength) ? null : String(data.focalLength),
				focal_length_35: blank(data.focalLength35) ? null : String(data.focalLength35),
				aperture: blank(data.aperture) ? null : String(data.aperture),
				shutter_speed: blank(data.shutterSpeed) ? null : String(data.shutterSpeed),
				iso: blank(data.iso) ? null : Number(data.iso),
			},
			taxonomies: { tag: (data.tags || []).filter((t) => !blank(t)).map((t) => slugify(t)) },
			...(dateTaken ? { publishedAt: dateTaken } : {}),
		});
		await client.publish("photos", item.id);
		ids.set(stem, item.id);
		created++;
		process.stdout.write(`  + ${stem}\n`);
	}
	console.log(`Photos: ${created} created, ${skipped} already there, ${missing.length} without an original.`);
	if (missing.length) console.log(`  No original in ${LOCAL_DIR} for: ${missing.join(", ")}\n  (re-run with --local <dir>, or --placeholder for stand-ins)`);
	return ids;
}

async function importSeries(photoIds) {
	const dir = path.join(ROOT, "series");
	const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
	const existing = await existingSlugs("series");
	for (const f of files) {
		const slug = f.slice(0, -3);
		if (existing.has(slug)) { console.log(`Series: ${slug} already there`); continue; }
		const { data, content } = matter(await fs.readFile(path.join(dir, f), "utf8"));
		const photos = (data.photos || []).map((s) => photoIds.get(s)).filter(Boolean);
		const cover = photoIds.get(data.coverPhoto) ?? photos[0];
		const item = await client.create("series", {
			slug,
			data: { title: data.title || slug, description: toPortableText(content) },
			references: { photos, ...(cover ? { cover: [cover] } : {}) },
		});
		await client.publish("series", item.id);
		console.log(`Series: ${slug} created with ${photos.length}/${(data.photos || []).length} photos`);
	}
}

const photoIds = await importPhotos();
await importSeries(photoIds);
