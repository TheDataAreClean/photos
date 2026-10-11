// Shared helpers for the photo pages.

export function formatDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	// Matches the gallery's amber date stamp: 'YY MM DD
	const yy = String(d.getUTCFullYear()).slice(2);
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `'${yy} ${mm} ${dd}`;
}

// Stable small tilt per slug, like the printed-photo cards on the live site.
export function tilt(slug: string): string {
	let h = 0;
	for (const c of slug) h = (h * 31 + c.charCodeAt(0)) | 0;
	return `${((Math.abs(h) % 30) - 15) / 10}deg`;
}

export const EXIF_FIELDS = [
	["camera", "Camera"],
	["lens", "Lens"],
	["focal_length", "Focal"],
	["focal_length_35", "35mm eq."],
	["aperture", "Aperture"],
	["shutter_speed", "Shutter"],
	["iso", "ISO"],
] as const;
