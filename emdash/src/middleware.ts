import { defineMiddleware } from "astro:middleware";

const MEDIA = /^\/_emdash\/api\/media\/file\//;
const PUBLIC_PAGE = /^\/($|photos\/|series\/|data\/|feed\.xml$)/;
const YEAR = 60 * 60 * 24 * 365;

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// The site is deliberately unindexed (public/robots.txt, noindex meta in
	// Base.astro), so EmDash's built-in sitemaps are switched off — the
	// Eleventy site never published one either.
	if (/^\/sitemap[\w-]*\.xml$/.test(pathname)) {
		return new Response("Not found", { status: 404 });
	}

	// Media filenames are unique IDs, so a file never changes: cache it for a
	// year in the browser and at Cloudflare's edge. EmDash's own route
	// revalidates on every view, which would send each of a gallery's 60+
	// thumbnails through the Worker again on every visit.
	if (context.request.method === "GET" && MEDIA.test(pathname)) {
		const ranged = context.request.headers.has("range");
		const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
		const key = new Request(context.url.href);
		if (edge && !ranged) {
			const hit = await edge.match(key).catch(() => undefined);
			if (hit) return hit;
		}
		const res = await next();
		if (res.status !== 200 || ranged) return res;
		const out = new Response(res.body, res);
		out.headers.set("Cache-Control", `public, max-age=${YEAR}, immutable`);
		if (edge) await edge.put(key, out.clone()).catch(() => undefined);
		return out;
	}

	const res = await next();

	// Public pages, data and feed: a minute in the browser for visitors.
	// Signed-in editors get no caching, so edits show at once.
	if (
		context.request.method === "GET" &&
		PUBLIC_PAGE.test(pathname) &&
		res.status === 200 &&
		!context.locals.user &&
		!res.headers.has("set-cookie") &&
		!res.headers.has("cache-control")
	) {
		const out = new Response(res.body, res);
		out.headers.set("Cache-Control", "public, max-age=60");
		return out;
	}
	return res;
});
