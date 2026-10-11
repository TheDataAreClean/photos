import { defineMiddleware } from "astro:middleware";

// The site is deliberately unindexed (public/robots.txt, noindex meta in
// Base.astro), so EmDash's built-in sitemaps are switched off — the Eleventy
// site never published one either.
export const onRequest = defineMiddleware((context, next) => {
	if (/^\/sitemap[\w-]*\.xml$/.test(context.url.pathname)) {
		return new Response("Not found", { status: 404 });
	}
	return next();
});
