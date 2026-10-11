// Builds the exact data the Eleventy site handed its front-end scripts:
// the photo objects in dist/data/photos-N.json and the series map in
// window.GallerySeriesMeta. The copied scripts in public/scripts/ read
// these shapes unchanged, so the gallery behaves the same.

import { getEmDashCollection, getEmDashEntry } from "emdash";

export const CHUNK_SIZE = 60;

export const site = {
	title: "Memories | TheDataAreClean",
	displayTitle: "Memories",
	description: "My experiments behind the viewfinder.",
	handle: "thedataareclean",
};

interface MediaRef {
	id: string;
	storageKey?: string;
}

interface ImageValue extends MediaRef {
	alt?: string;
	width?: number;
	height?: number;
	meta?: {
		storageKey?: string;
		variants?: { download?: MediaRef; thumb?: MediaRef };
	};
}

export interface PhotoData {
	id: string;
	image?: ImageValue | null;
	title?: string | null;
	caption?: unknown;
	date_taken?: Date | string | null;
	camera?: string | null;
	lens?: string | null;
	focal_length?: string | null;
	focal_length_35?: string | null;
	aperture?: string | null;
	shutter_speed?: string | null;
	iso?: number | null;
	publishedAt?: Date | null;
	updatedAt?: Date | null;
}

interface SeriesData {
	id: string;
	title?: string | null;
	description?: unknown;
}

export interface GalleryPhoto {
	id: string;
	source: "emdash";
	title: string | null;
	description: string | null;
	altText: string;
	url: { full: string; display: string; download: string; thumb: string };
	width: number | null;
	height: number | null;
	aspectRatio: number | null;
	dateTaken: string | null;
	dateAdded: string | null;
	exif: {
		camera: string | null;
		lens: string | null;
		focalLength: string | null;
		focalLength35: string | null;
		aperture: string | null;
		shutterSpeed: string | null;
		iso: number | null;
	};
	tags: string[];
	series: string | null;
	seriesOrder: number | null;
	seriesTitle?: string | null;
	seriesCount?: number;
	sidecarUpdatedAt: string | null;
	/** EmDash entry ID, for the edit button and inline editing. */
	entryId: string;
}

export interface SeriesMeta {
	slug: string;
	title: string;
	description: string | null;
	coverPhoto: string | null;
	photos: { id: string; order: number }[];
	entryId: string;
}

export function mediaUrl(ref: MediaRef | undefined | null): string {
	if (!ref) return "";
	return `/_emdash/api/media/file/${ref.storageKey ?? ref.id}`;
}

/** Portable Text (or a legacy plain string) → plain text, paragraphs split by a blank line. */
export function plainText(value: unknown): string | null {
	if (typeof value === "string") return value.trim() || null;
	if (!Array.isArray(value)) return null;
	const paragraphs = value
		.map((block) =>
			block && typeof block === "object" && Array.isArray((block as { children?: unknown }).children)
				? (block as { children: { text?: string }[] }).children.map((c) => c.text ?? "").join("")
				: "",
		)
		.filter((p) => p.trim());
	return paragraphs.length ? paragraphs.join("\n\n").trim() : null;
}

const iso = (d: Date | string | null | undefined) => {
	if (!d) return null;
	const date = d instanceof Date ? d : new Date(d);
	// Sidecars wrote whole seconds without milliseconds; keep that shape.
	return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(".000Z", "Z");
};

const str = (v: string | null | undefined) => (v === undefined || v === null || v === "" ? null : v);

export function toGalleryPhoto(slug: string, data: PhotoData): GalleryPhoto {
	const image = data.image ?? undefined;
	const display = mediaUrl(image?.meta?.storageKey ? { id: image.id, storageKey: image.meta.storageKey } : image);
	const variants = image?.meta?.variants;
	const width = image?.width ?? null;
	const height = image?.height ?? null;
	const title = str(data.title);
	const dateTaken = iso(data.date_taken);
	return {
		id: slug,
		source: "emdash",
		title,
		description: plainText(data.caption),
		altText: title ?? slug.replace(/-/g, " "),
		url: {
			full: display,
			display,
			download: mediaUrl(variants?.download) || display,
			thumb: mediaUrl(variants?.thumb) || display,
		},
		width,
		height,
		aspectRatio: width && height ? Number.parseFloat((width / height).toFixed(4)) : null,
		dateTaken,
		dateAdded: dateTaken ?? iso(data.publishedAt),
		exif: {
			camera: str(data.camera),
			lens: str(data.lens),
			focalLength: str(data.focal_length),
			focalLength35: str(data.focal_length_35),
			aperture: str(data.aperture),
			shutterSpeed: str(data.shutter_speed),
			iso: data.iso ?? null,
		},
		tags: [],
		series: null,
		seriesOrder: null,
		sidecarUpdatedAt: iso(data.updatedAt),
		entryId: data.id,
	};
}

export interface Gallery {
	photos: GalleryPhoto[];
	series: Record<string, SeriesMeta>;
	cacheHints: unknown[];
}

/** Every published photo, newest first, with series membership applied. */
export async function loadGallery(): Promise<Gallery> {
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
		for (const entry of page.entries) photos.push(toGalleryPhoto(entry.id, entry.data));
		cursor = page.nextCursor;
	} while (cursor);

	// Same ordering as build/merge.js: dateTaken (else dateAdded) descending.
	photos.sort((a, b) => {
		const da = a.dateTaken || a.dateAdded || "";
		const db = b.dateTaken || b.dateAdded || "";
		return da < db ? 1 : da > db ? -1 : 0;
	});

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

/** Series photos in their series order, as `seriesPhotos` did in .eleventy.js. */
export function seriesPhotos(photos: GalleryPhoto[], slug: string): GalleryPhoto[] {
	return photos
		.filter((p) => p.series === slug)
		.sort((a, b) => (a.seriesOrder ?? 9999) - (b.seriesOrder ?? 9999));
}

/** "Monday, January 1, 2024" — .eleventy.js `longDate`. */
export function longDate(isoDate: string | null): string {
	if (!isoDate) return "";
	const d = new Date(isoDate);
	return Number.isNaN(d.getTime())
		? ""
		: d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** JSON safe to drop inside a <script> element. */
export function scriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}
