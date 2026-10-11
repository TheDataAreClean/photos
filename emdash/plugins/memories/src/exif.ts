/** EXIF handling shared by the browser widget and the save hook. */

/** What the widget keeps from a photo's EXIF. Never location. */
export interface PhotoExif {
	date_taken?: string;
	camera?: string;
	lens?: string;
	focal_length?: string;
	focal_length_35?: string;
	aperture?: string;
	shutter_speed?: string;
	iso?: number;
}

export const EXIF_KEYS = [
	"date_taken",
	"camera",
	"lens",
	"focal_length",
	"focal_length_35",
	"aperture",
	"shutter_speed",
	"iso",
] as const;

/** Format the raw exifr output the same way build/sources/local.js does. */
export function formatExif(raw: Record<string, unknown> | undefined | null): PhotoExif {
	if (!raw) return {};
	const out: PhotoExif = {};
	const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

	const make = str(raw.Make);
	const model = str(raw.Model);
	const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim();
	if (camera) out.camera = camera;
	const lens = str(raw.LensModel) || str(raw.Lens);
	if (lens) out.lens = lens;

	const fl = num(raw.FocalLength);
	if (fl !== undefined) out.focal_length = `${Math.round(fl)}mm`;
	const fl35 = num(raw.FocalLengthIn35mmFormat);
	if (fl35 !== undefined) out.focal_length_35 = `${Math.round(fl35)}mm`;
	const f = num(raw.FNumber);
	if (f !== undefined) out.aperture = `f/${f}`;
	const t = num(raw.ExposureTime);
	if (t !== undefined) out.shutter_speed = t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}s`;
	const iso = num(raw.ISO) ?? num(raw.ISOSpeedRatings);
	if (iso !== undefined) out.iso = iso;

	const taken = raw.DateTimeOriginal ?? raw.CreateDate;
	if (taken instanceof Date && !Number.isNaN(taken.getTime())) {
		// EXIF times carry no zone; exifr builds them in the browser's zone.
		// Read the wall-clock parts back and store them as UTC, which is what
		// the Node pipeline did on CI, so dates don't shift by the editor's zone.
		out.date_taken = new Date(
			Date.UTC(
				taken.getFullYear(),
				taken.getMonth(),
				taken.getDate(),
				taken.getHours(),
				taken.getMinutes(),
				taken.getSeconds(),
			),
		).toISOString();
	}
	return out;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Fill blank EXIF fields from `image.meta.exif`. Explicit values win;
 * `iso: 0` counts as a value.
 */
export function fillFromExif(content: Record<string, unknown>): Record<string, unknown> {
	const image = content.image as { meta?: { exif?: PhotoExif } } | null | undefined;
	const exif = image?.meta?.exif;
	if (!exif) return content;
	const next = { ...content };
	for (const key of EXIF_KEYS) {
		if (isEmpty(next[key]) && !isEmpty(exif[key])) next[key] = exif[key];
	}
	return next;
}
