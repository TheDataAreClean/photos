import assert from "node:assert/strict";
import { test } from "node:test";

import { fillFromExif, formatExif } from "../plugins/memories/src/exif.ts";

test("formatExif matches the Eleventy build's formatting", () => {
	const out = formatExif({
		Make: "FUJIFILM",
		Model: "X-T50",
		LensModel: "XF16-50mm",
		FocalLength: 32.4,
		FocalLengthIn35mmFormat: 48,
		FNumber: 3.2,
		ExposureTime: 1 / 100,
		ISO: 320,
	});
	assert.equal(out.camera, "FUJIFILM X-T50");
	assert.equal(out.lens, "XF16-50mm");
	assert.equal(out.focal_length, "32mm");
	assert.equal(out.focal_length_35, "48mm");
	assert.equal(out.aperture, "f/3.2");
	assert.equal(out.shutter_speed, "1/100s");
	assert.equal(out.iso, 320);
});

test("camera name isn't doubled when the model already starts with the make", () => {
	assert.equal(formatExif({ Make: "Apple", Model: "Apple iPhone 15" }).camera, "Apple iPhone 15");
	assert.equal(formatExif({ Make: "Apple", Model: "iPhone 15" }).camera, "Apple iPhone 15");
});

test("long exposures keep whole seconds", () => {
	assert.equal(formatExif({ ExposureTime: 2 }).shutter_speed, "2s");
});

test("missing or empty EXIF gives nothing", () => {
	assert.deepEqual(formatExif(null), {});
	assert.deepEqual(formatExif(undefined), {});
	assert.deepEqual(formatExif({}), {});
});

test("EXIF time is stored as the wall-clock time, in UTC", () => {
	// exifr builds the Date in the browser's zone; the editor's zone must not shift the day.
	const local = new Date(2026, 8, 14, 18, 22, 5);
	assert.equal(formatExif({ DateTimeOriginal: local }).date_taken, "2026-09-14T18:22:05.000Z");
});

test("location never survives: only the whitelisted keys are kept", () => {
	const out = formatExif({ Make: "X", Model: "Y", latitude: 12.9, longitude: 77.5, GPSLatitude: [12, 58, 0] });
	assert.deepEqual(Object.keys(out), ["camera"]);
});

test("fillFromExif fills blanks, keeps typed values, treats iso 0 as a value", () => {
	const content = {
		image: { meta: { exif: { camera: "EXIF cam", lens: "EXIF lens", iso: 400 } } },
		camera: "My own text",
		lens: "",
		iso: 0,
	};
	const out = fillFromExif(content);
	assert.equal(out.camera, "My own text");
	assert.equal(out.lens, "EXIF lens");
	assert.equal(out.iso, 0);
});

test("fillFromExif leaves content alone without stored EXIF", () => {
	const content = { title: "x" };
	assert.equal(fillFromExif(content), content);
});
