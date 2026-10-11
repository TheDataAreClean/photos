import type { APIRoute } from "astro";
import { extractPlainText, getEmDashCollection, getSiteSettings } from "emdash";

// Atom feed, same shape as the Eleventy site's /feed.xml: latest 15 photos.
export const GET: APIRoute = async ({ url }) => {
	const settings = await getSiteSettings();
	const siteUrl = (settings?.url || url.origin).replace(/\/$/, "");
	const title = settings?.title || "Memories";

	const { entries } = await getEmDashCollection("photos", {
		orderBy: { date_taken: "desc" },
		limit: 15,
	});

	const abs = (src: string | undefined) => (src ? new URL(src, siteUrl).href : "");
	const items = entries
		.map((p) => {
			const link = `${siteUrl}/photos/${p.id}/`;
			const updated = (p.data.updatedAt ?? p.data.publishedAt ?? new Date()).toISOString();
			const caption = p.data.caption ? extractPlainText(p.data.caption) : "";
			const img = abs(p.data.image?.src);
			const html = `${img ? `<p><img src="${esc(img)}" alt="${esc(p.data.title)}"/></p>` : ""}${caption ? `<p>${esc(caption)}</p>` : ""}`;
			return `  <entry>
    <title>${esc(p.data.title || "Untitled")}</title>
    <link href="${link}"/>
    <id>${link}</id>
    <updated>${updated}</updated>
    <content type="html">${esc(html)}</content>
  </entry>`;
		})
		.join("\n");

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(title)}</title>
  <link href="${siteUrl}/"/>
  <link rel="self" href="${siteUrl}/feed.xml"/>
  <id>${siteUrl}/</id>
  <updated>${new Date().toISOString()}</updated>
${items}
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
		.replace(/"/g, "&quot;");
}
