// Pure helpers and types for the gallery data: no EmDash imports, so they
// can be unit-tested with plain Node (tests/).

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

/**
 * Where media files are served from. By default EmDash's own route; set
 * PUBLIC_MEDIA_BASE (e.g. https://media.example.com) to serve straight from a
 * public R2 domain instead, which bypasses the Worker for every image.
 */
export function mediaUrl(ref: MediaRef | undefined | null, base = "/_emdash/api/media/file"): string {
	if (!ref) return "";
	return `${base.replace(/\/$/, "")}/${ref.storageKey ?? ref.id}`;
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

export const str = (v: string | null | undefined) => (v === undefined || v === null || v === "" ? null : v);

export function toGalleryPhoto(slug: string, data: PhotoData, mediaBase?: string): GalleryPhoto {
	const image = data.image ?? undefined;
	const at = (ref: MediaRef | undefined | null) => mediaUrl(ref, mediaBase);
	const display = at(image?.meta?.storageKey ? { id: image.id, storageKey: image.meta.storageKey } : image);
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
			download: at(variants?.download) || display,
			thumb: at(variants?.thumb) || display,
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
