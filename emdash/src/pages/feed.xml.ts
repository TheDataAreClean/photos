import type { APIRoute } from "astro";
import { getSiteSettings, getTermsForEntries } from "emdash";

import { loadGallery, site, type GalleryPhoto } from "../lib/gallery";

// Atom feed — same entries and markup as the Eleventy site's src/feed.njk:
// latest 15, each series collapsed to its opening photo.
export const GET: APIRoute = async ({ url }) => {
	const settings = await getSiteSettings();
	const siteUrl = (settings?.url || url.origin).replace(/\/$/, "");
	const { photos } = await loadGallery();

	const feedPhotos = photos.filter((p) => !p.series || p.seriesOrder === 1).slice(0, 15);
	const terms = await getTermsForEntries(
		"photos",
		feedPhotos.map((p) => p.entryId),
		"tag",
	).catch(() => new Map());
	for (const p of feedPhotos) p.tags = (terms.get(p.entryId) ?? []).map((t: { label: string }) => t.label);

	const abs = (u: string) => (/^https?:\/\//.test(u) ? u : siteUrl + u);
	const entries = feedPhotos.map((p) => (p.series ? seriesEntry(p) : photoEntry(p))).join("");

	function seriesEntry(photo: GalleryPhoto) {
		const seriesUrl = `${siteUrl}/series/${photo.series}/`;
		const imageUrl = abs(photo.url.download);
		return `
  <entry>
    <id>${seriesUrl}</id>
    <title>${esc(photo.seriesTitle ?? "")}</title>
    <link href="${seriesUrl}" rel="alternate" type="text/html"/>
    <published>${rfc3339(photo.dateAdded)}</published>
    <updated>${rfc3339(laterDate(photo.dateAdded, photo.sidecarUpdatedAt))}</updated>
    <content type="html"><![CDATA[${imageUrl ? `<img src="${imageUrl}" alt="${esc(photo.seriesTitle ?? "")}">` : ""}
      ${toParagraphs(photo.description)}
      <hr>
      <p>📁 <a href="${seriesUrl}">View all ${photo.seriesCount} photos in this series →</a></p>
    ]]></content>
  </entry>`;
	}

	function photoEntry(photo: GalleryPhoto) {
		const permalink = `${siteUrl}/photos/${photo.id}/`;
		const imageUrl = abs(photo.url.download);
		const e = photo.exif;
		let content = `${imageUrl ? `<img src="${imageUrl}" alt="${esc(photo.title ?? "")}">` : ""}
      ${toParagraphs(photo.description)}`;
		if (photo.dateTaken) {
			content += `
      <hr>
      <p><small>📆 Captured ${shortDate(photo.dateTaken)}</small></p>`;
		}
		if (e.camera || e.lens) {
			const parts = [
				e.camera,
				e.lens,
				e.focalLength35 ? `${e.focalLength35}${e.focalLength ? ` (${e.focalLength})` : ""}` : e.focalLength,
				e.aperture,
				e.shutterSpeed,
				e.iso ? `ISO ${e.iso}` : null,
			];
			const line = parts.map((v, i) => (v ? (i === 0 ? ` ${v}` : ` · ${v}`) : "")).join("");
			content += `
      <hr>
      <p><small>📷${line}
      </small></p>`;
		}
		if (photo.tags.length) {
			content += `
      <hr>
      <p><small>🏷️${photo.tags.map((t) => ` #${t}`).join("")}
      </small></p>`;
		}
		return `
  <entry>
    <id>${permalink}</id>
    <title>${esc(photo.title ?? "")}</title>
    <link href="${permalink}" rel="alternate" type="text/html"/>
    <published>${rfc3339(photo.dateAdded)}</published>
    <updated>${rfc3339(laterDate(photo.dateAdded, photo.sidecarUpdatedAt))}</updated>${photo.tags
			.map((t) => `
    <category term="${esc(t)}"/>`)
			.join("")}
    <content type="html"><![CDATA[${content}
    ]]></content>
  </entry>`;
	}

	const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${siteUrl}/feed.xml</id>
  <title>${esc(site.title)}</title>
  <subtitle>${esc(site.description)}</subtitle>
  <link href="${siteUrl}/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${siteUrl}/" rel="alternate" type="text/html"/>
  <updated>${rfc3339(feedPhotos[0]?.dateAdded ?? null)}</updated>
  <author>
    <name>Arpit</name>
    <uri>${siteUrl}</uri>
  </author>${entries}
</feed>`;

	return new Response(xml, {
		headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
	});
};

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&#34;")
		.replace(/'/g, "&#39;");
}

function rfc3339(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function laterDate(a: string | null, b: string | null): string {
	const da = a ? new Date(a) : new Date(0);
	const db = b ? new Date(b) : new Date(0);
	return (da > db ? da : db).toISOString();
}

function toParagraphs(text: string | null): string {
	if (!text) return "";
	return text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
		.join("");
}

function shortDate(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? ""
		: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
