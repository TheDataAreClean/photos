import type { APIRoute } from "astro";

import { CHUNK_SIZE, loadGallery } from "../../lib/gallery";

// /data/photos-N.json — the infinite-scroll chunks gallery.js fetches,
// same shape and size as the Eleventy build wrote to dist/data/.
export const GET: APIRoute = async ({ params, cache }) => {
	const match = /^photos-(\d+)$/.exec(params.chunk ?? "");
	const n = match ? Number(match[1]) : 0;
	const { photos, cacheHints } = await loadGallery();
	if (cache?.enabled) for (const hint of cacheHints) cache.set(hint as never);
	const chunk = photos.slice((n - 1) * CHUNK_SIZE, n * CHUNK_SIZE);
	if (n < 1 || chunk.length === 0) return new Response("Not found", { status: 404 });
	return new Response(JSON.stringify(chunk), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
};
