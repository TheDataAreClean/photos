/**
 * Photo upload widget. Replaces the editor for the photos `image` field.
 *
 * Pick a photo → EXIF read here → canvas re-encodes (no metadata survives a
 * canvas, so GPS is gone) → upload. Three files, like the Eleventy build:
 * the 2400px display image, a watermarked copy for the Download button
 * (18% width, bottom-right, 1.8% margin — build/watermark.js), and an 800px
 * thumbnail. The image value is the display file; the other two ride along
 * in `meta.variants`, and the safe EXIF subset in `meta.exif`, which the
 * plugin's save hook copies into blank fields.
 */
import { uploadMedia } from "@emdash-cms/admin";
import exifr from "exifr";
import * as React from "react";

import { formatExif, type PhotoExif } from "./exif.js";
import watermarkUrl from "./watermark.png?url";

const MAX_WIDTH = 2400;
const QUALITY = 0.85;
const THUMB_WIDTH = 800;

interface ImageValue {
	id: string;
	provider?: string;
	alt?: string;
	width?: number;
	height?: number;
	filename?: string;
	mimeType?: string;
	meta?: Record<string, unknown> & {
		storageKey?: string;
		exif?: PhotoExif;
		variants?: Record<string, { id: string; storageKey: string }>;
	};
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

export interface Variant {
	blob: Blob;
	width: number;
	height: number;
	type: string;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), type, quality),
	);
}

function draw(src: ImageBitmap, width: number) {
	const scale = Math.min(1, width / src.width);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(src.width * scale);
	canvas.height = Math.round(src.height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
	return { canvas, ctx };
}

/**
 * The three files the gallery serves, as on the Eleventy site:
 * display (2400px, clean), download (display + watermark), thumb (800px WebP).
 * Every one is a fresh canvas encode, so none carries EXIF or GPS.
 */
export async function processPhoto(
	file: File,
): Promise<{ display: Variant; download: Variant; thumb: Variant }> {
	const src = await createImageBitmap(file, { imageOrientation: "from-image" });
	try {
		const { canvas, ctx } = draw(src, MAX_WIDTH);
		const { width, height } = canvas;
		const display = { blob: await encode(canvas, "image/jpeg", QUALITY), width, height, type: "image/jpeg" };

		const wm = await loadWatermark();
		const wmW = Math.round(width * 0.18);
		const wmH = Math.round((wm.height / wm.width) * wmW);
		const margin = Math.round(width * 0.018);
		ctx.drawImage(wm, width - wmW - margin, height - wmH - margin, wmW, wmH);
		const download = { blob: await encode(canvas, "image/jpeg", QUALITY), width, height, type: "image/jpeg" };

		const small = draw(src, THUMB_WIDTH).canvas;
		const thumbBlob = await encode(small, "image/webp", 0.82);
		// Browsers that can't encode WebP hand back PNG; JPEG is smaller then.
		const thumb =
			thumbBlob.type === "image/webp"
				? { blob: thumbBlob, width: small.width, height: small.height, type: "image/webp" }
				: { blob: await encode(small, "image/jpeg", QUALITY), width: small.width, height: small.height, type: "image/jpeg" };
		return { display, download, thumb };
	} finally {
		src.close();
	}
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
			const { display, download, thumb } = await processPhoto(file);
			const stem = file.name.replace(/\.[^.]+$/, "");
			const ext = (t: string) => (t === "image/webp" ? "webp" : "jpg");
			const asFile = (v: Variant, suffix: string) =>
				new File([v.blob], `${stem}${suffix}.${ext(v.type)}`, { type: v.type });

			setBusy("Uploading…");
			const [main, dl, th] = await Promise.all([
				uploadMedia(asFile(display, "")),
				uploadMedia(asFile(download, "-download")),
				uploadMedia(asFile(thumb, "@800")),
			]);
			const ref = (m: typeof main) => ({ id: m.id, storageKey: m.storageKey });
			onChange({
				id: main.id,
				provider: "local",
				alt: current?.alt ?? "",
				width: main.width ?? display.width,
				height: main.height ?? display.height,
				filename: main.filename,
				mimeType: main.mimeType,
				meta: {
					...main.meta,
					storageKey: main.storageKey,
					exif,
					variants: { download: ref(dl), thumb: ref(th) },
				},
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
							: "Drop a photo or choose one. Location data is removed before upload; the download copy gets the watermark.")}
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
