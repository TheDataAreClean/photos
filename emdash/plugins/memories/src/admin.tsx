/**
 * Photo upload widget. Replaces the editor for the photos `image` field.
 *
 * Pick a photo → EXIF read here → canvas re-encode at ≤2400px (no metadata
 * survives a canvas, so GPS is gone) → watermark burned in bottom-right at
 * 18% width, 1.8% margin (same as build/watermark.js) → upload. The stored
 * image value carries the safe EXIF subset in `meta.exif`; the plugin's
 * save hook copies it into blank fields.
 */
import { uploadMedia } from "@emdash-cms/admin";
import exifr from "exifr";
import * as React from "react";

import { formatExif, type PhotoExif } from "./exif.js";
import watermarkUrl from "./watermark.png?url";

const MAX_WIDTH = 2400;
const QUALITY = 0.85;

interface ImageValue {
	id: string;
	provider?: string;
	alt?: string;
	width?: number;
	height?: number;
	filename?: string;
	mimeType?: string;
	meta?: Record<string, unknown> & { storageKey?: string; exif?: PhotoExif };
}

interface FieldWidgetProps {
	value: unknown;
	onChange: (value: unknown) => void;
	label: string;
	id: string;
	required?: boolean;
}

let watermark: Promise<ImageBitmap> | undefined;
function loadWatermark() {
	watermark ??= fetch(watermarkUrl)
		.then((r) => r.blob())
		.then((b) => createImageBitmap(b));
	return watermark;
}

/** Decode (EXIF orientation applied), resize, watermark, re-encode as JPEG. */
export async function processPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
	const src = await createImageBitmap(file, { imageOrientation: "from-image" });
	const scale = Math.min(1, MAX_WIDTH / src.width);
	const width = Math.round(src.width * scale);
	const height = Math.round(src.height * scale);

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(src, 0, 0, width, height);
	src.close();

	const wm = await loadWatermark();
	const wmW = Math.round(width * 0.18);
	const wmH = Math.round((wm.height / wm.width) * wmW);
	const margin = Math.round(width * 0.018);
	ctx.drawImage(wm, width - wmW - margin, height - wmH - margin, wmW, wmH);

	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/jpeg", QUALITY),
	);
	return { blob, width, height };
}

function previewUrl(v: ImageValue) {
	const key = typeof v.meta?.storageKey === "string" ? v.meta.storageKey : v.id;
	return `/_emdash/api/media/file/${encodeURIComponent(key)}`;
}

function slugify(s: string) {
	return s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Keep a new photo's slug as `YYYY-MM-DD-title` (the old permalink shape)
 * while the slug is still auto-generated. Stops as soon as someone types
 * their own slug. Best effort: the slug box lives in the settings sidebar.
 */
function useDateSlug(dateTaken: string | undefined) {
	const last = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (!dateTaken) return;
		const date = dateTaken.slice(0, 10);
		const apply = () => {
			const title = document.querySelector<HTMLInputElement>("#field-title");
			const slug = document.querySelector<HTMLInputElement>('input[placeholder="my-post-slug"]');
			if (!title || !slug || !title.value) return;
			const auto = slugify(title.value);
			const isAuto = slug.value === "" || slug.value === auto || slug.value === last.current;
			const want = `${date}-${auto}`;
			if (!isAuto || slug.value === want) return;
			last.current = want;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(slug, want);
			slug.dispatchEvent(new Event("input", { bubbles: true }));
		};
		// After React has applied the title's own auto-slug.
		const onInput = (e: Event) => {
			if ((e.target as HTMLElement | null)?.id === "field-title") setTimeout(apply, 0);
		};
		document.addEventListener("input", onInput);
		apply();
		return () => document.removeEventListener("input", onInput);
	}, [dateTaken]);
}

function PhotoUpload({ value, onChange, label, id, required }: FieldWidgetProps) {
	const current = value && typeof value === "object" ? (value as ImageValue) : undefined;
	const [busy, setBusy] = React.useState<string>();
	const [error, setError] = React.useState<string>();
	const input = React.useRef<HTMLInputElement>(null);

	useDateSlug(current?.meta?.exif?.date_taken);

	const pick = async (file: File | undefined) => {
		if (!file) return;
		setError(undefined);
		try {
			setBusy("Reading EXIF…");
			const raw = await exifr.parse(file, { gps: false, iptc: false, xmp: true }).catch(() => null);
			const exif = formatExif(raw);

			setBusy("Removing location, adding watermark…");
			const { blob, width, height } = await processPhoto(file);
			const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
			const clean = new File([blob], name, { type: "image/jpeg" });

			setBusy("Uploading…");
			const item = await uploadMedia(clean);
			onChange({
				id: item.id,
				provider: "local",
				alt: current?.alt ?? "",
				width: item.width ?? width,
				height: item.height ?? height,
				filename: item.filename,
				mimeType: item.mimeType,
				meta: { ...item.meta, storageKey: item.storageKey, exif },
			} satisfies ImageValue);
		} catch (cause) {
			setError(
				cause instanceof Error && /decode|source image/i.test(cause.message)
					? "This browser can't read that file. Export it as JPEG first (HEIC works in Safari)."
					: cause instanceof Error
						? cause.message
						: String(cause),
			);
		} finally {
			setBusy(undefined);
			if (input.current) input.current.value = "";
		}
	};

	const exif = current?.meta?.exif;
	const facts = exif
		? [exif.camera, exif.lens, exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso && `ISO ${exif.iso}`]
				.filter(Boolean)
				.join(" · ")
		: "";

	return (
		<div className="grid gap-2" data-memories-photo>
			<label htmlFor={id} className="text-base font-medium">
				{label}
				{required ? " *" : ""}
			</label>
			<div
				className="grid gap-3 rounded-lg border border-dashed border-kumo-line p-3"
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					void pick(e.dataTransfer.files[0]);
				}}
			>
				{current?.id ? (
					<img
						src={previewUrl(current)}
						alt={current.alt ?? ""}
						className="max-h-80 w-full rounded object-contain"
					/>
				) : null}
				<div className="flex flex-wrap items-center gap-3">
					<input
						ref={input}
						id={id}
						type="file"
						accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
						disabled={!!busy}
						onChange={(e) => void pick(e.target.files?.[0])}
						className="text-sm"
					/>
					{current?.id ? (
						<button
							type="button"
							className="text-sm text-kumo-danger underline"
							onClick={() => onChange(null)}
							disabled={!!busy}
						>
							Remove
						</button>
					) : null}
				</div>
				<p className="text-xs text-kumo-subtle" role="status">
					{busy ??
						(current?.id
							? [`${current.width}×${current.height}`, facts].filter(Boolean).join(" · ")
							: "Drop a photo or choose one. Location data is removed and the watermark added before upload.")}
				</p>
				{error ? (
					<p role="alert" className="text-sm text-kumo-danger">
						{error}
					</p>
				) : null}
			</div>
		</div>
	);
}

export const fields = {
	"photo-upload": PhotoUpload,
};
