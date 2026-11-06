// Loads the gallery from EmDash in the exact shape the Eleventy site handed
// its front-end scripts: the photo objects in dist/data/photos-N.json and the
// series map in window.GallerySeriesMeta. The copied scripts in public/scripts/
// read these shapes unchanged, so the gallery behaves the same.

import { getEmDashCollection, getEmDashEntry, getTermsForEntries } from "emdash";

import {
	CHUNK_SIZE,
	plainText,
	str,
	toGalleryPhoto,
	type GalleryPhoto,
	type PhotoData,
	type SeriesMeta,
} from "./shape";

export * from "./shape";

interface SeriesData {
	id: string;
	title?: string | null;
	description?: unknown;
}

export interface Gallery {
	photos: GalleryPhoto[];
	series: Record<string, SeriesMeta>;
	cacheHints: unknown[];
}

export const MEDIA_BASE: string | undefined = import.meta.env.PUBLIC_MEDIA_BASE || undefined;

// A Worker isolate keeps this between requests, so a page view, its
// infinite-scroll chunks and the feed share one load instead of each
// re-reading every photo and series from D1. Signed-in editors bypass it,
// so they see their changes at once; everyone else sees them within the TTL.
const TTL_MS = 30_000;
let cached: { at: number; gallery: Gallery } | undefined;
let inflight: Promise<Gallery> | undefined;

export function loadGallery({ fresh = false } = {}): Promise<Gallery> {
	if (!fresh && cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.gallery);
	if (!fresh && inflight) return inflight;
	const run = readGallery().then((gallery) => {
		if (!fresh) cached = { at: Date.now(), gallery };
		return gallery;
	});
	if (!fresh) inflight = run.finally(() => (inflight = undefined));
	return run;
}

/** Every published photo, newest first, with series membership and tags applied. */
async function readGallery(): Promise<Gallery> {
	const cacheHints: unknown[] = [];
	const photos: GalleryPhoto[] = [];
	let cursor: string | undefined;
	do {
		const page = await getEmDashCollection<PhotoData>("photos", {
			orderBy: { date_taken: "desc" },
			limit: 100,
			...(cursor ? { cursor } : {}),
		});
		if (page.error) throw page.error;
		cacheHints.push(page.cacheHint);
		for (const entry of page.entries) photos.push(toGalleryPhoto(entry.id, entry.data, MEDIA_BASE));
		cursor = page.nextCursor;
	} while (cursor);

	// Same ordering as build/merge.js: dateTaken (else dateAdded) descending.
	photos.sort((a, b) => {
		const da = a.dateTaken || a.dateAdded || "";
		const db = b.dateTaken || b.dateAdded || "";
		return da < db ? 1 : da > db ? -1 : 0;
	});

	// Tags, one query for all photos.
	const terms = await getTermsForEntries(
		"photos",
		photos.map((p) => p.entryId),
		"tag",
	).catch(() => new Map<string, { label: string }[]>());
	for (const p of photos) p.tags = (terms.get(p.entryId) ?? []).map((t) => t.label);

	const seriesList = await getEmDashCollection<SeriesData>("series", { limit: 100 });
	if (seriesList.error) throw seriesList.error;
	cacheHints.push(seriesList.cacheHint);
	const entries = await Promise.all(
		seriesList.entries.map((s) =>
			getEmDashEntry<SeriesData>("series", s.id, { references: { cover: true, photos: { limit: 500 } } }),
		),
	);

	const series: Record<string, SeriesMeta> = {};
	const byId = new Map(photos.map((p) => [p.id, p]));
	for (const { entry } of entries) {
		if (!entry) continue;
		const members = entry.references?.photos?.entries ?? [];
		const cover = entry.references?.cover?.entries?.[0];
		const meta: SeriesMeta = {
			slug: entry.id,
			title: str(entry.data.title) ?? entry.id,
			description: plainText(entry.data.description),
			coverPhoto: cover?.id ?? null,
			photos: members.map((m, i) => ({ id: m.id, order: i + 1 })),
			entryId: entry.data.id,
		};
		series[meta.slug] = meta;
		for (const { id, order } of meta.photos) {
			const photo = byId.get(id);
			if (!photo) continue;
			photo.series = meta.slug;
			photo.seriesOrder = order;
			photo.seriesTitle = meta.title;
			photo.seriesCount = meta.photos.length;
		}
	}

	return { photos, series, cacheHints };
}
