import assert from "node:assert/strict";
import { test } from "node:test";

import { longDate, mediaUrl, plainText, scriptJson, seriesPhotos, toGalleryPhoto } from "../src/lib/shape.ts";

const photo = (extra = {}) => ({
	id: "entry1",
	image: {
		id: "m1",
		width: 2400,
		height: 1600,
		meta: {
			storageKey: "main.jpg",
			variants: { download: { id: "m2", storageKey: "dl.jpg" }, thumb: { id: "m3", storageKey: "th.webp" } },
		},
	},
	title: "Imitate",
	date_taken: "2026-03-21T10:00:00.000Z",
	camera: "Fujifilm X-T50",
	iso: 320,
	...extra,
});

test("a photo becomes the object the gallery scripts read", () => {
	const p = toGalleryPhoto("2026-03-21-imitate", photo());
	assert.equal(p.id, "2026-03-21-imitate");
	assert.equal(p.url.display, "/_emdash/api/media/file/main.jpg");
	assert.equal(p.url.download, "/_emdash/api/media/file/dl.jpg");
	assert.equal(p.url.thumb, "/_emdash/api/media/file/th.webp");
	assert.equal(p.aspectRatio, 1.5);
	assert.equal(p.dateTaken, "2026-03-21T10:00:00Z");
	assert.equal(p.exif.camera, "Fujifilm X-T50");
	assert.equal(p.exif.lens, null);
	assert.equal(p.exif.iso, 320);
});

test("media can come from another base URL", () => {
	assert.equal(toGalleryPhoto("a", photo(), "https://media.example.com/").url.display, "https://media.example.com/main.jpg");
	assert.equal(mediaUrl({ id: "x" }), "/_emdash/api/media/file/x");
	assert.equal(mediaUrl(null), "");
});

test("no variants falls back to the display file", () => {
	const p = toGalleryPhoto("a", photo({ image: { id: "m1", meta: { storageKey: "main.jpg" } } }));
	assert.equal(p.url.thumb, p.url.display);
	assert.equal(p.url.download, p.url.display);
});

test("an untitled photo gets alt text from its slug", () => {
	const p = toGalleryPhoto("2026-05-17-gate-1", photo({ title: "" }));
	assert.equal(p.title, null);
	assert.equal(p.altText, "2026 05 17 gate 1");
});

test("captions: Portable Text to plain paragraphs", () => {
	const block = (text) => ({ _type: "block", children: [{ _type: "span", text }] });
	assert.equal(plainText([block("One."), block("Two.")]), "One.\n\nTwo.");
	assert.equal(plainText([]), null);
	assert.equal(plainText("  legacy text "), "legacy text");
	assert.equal(plainText(undefined), null);
});

test("series photos are ordered, others dropped", () => {
	const mk = (id, series, order) => ({ id, series, seriesOrder: order });
	const out = seriesPhotos([mk("c", "s", 3), mk("x", null, null), mk("a", "s", 1), mk("b", "s", 2)], "s");
	assert.deepEqual(out.map((p) => p.id), ["a", "b", "c"]);
});

test("dates and inline JSON are safe", () => {
	assert.equal(longDate("2026-03-21T10:00:00Z"), "Saturday, March 21, 2026");
	assert.equal(longDate(null), "");
	assert.equal(scriptJson({ t: "</script>" }).includes("</script>"), false);
});
