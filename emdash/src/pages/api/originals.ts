import type { APIRoute } from "astro";

// Receives the untouched original from the admin's photo widget and files it
// in the private R2 bucket (binding ORIGINALS). That bucket is never served:
// nothing here reads it back, and public media lives in a different bucket.
// Signed-in editors only.
export const prerender = false;

const MAX_BYTES = 40 * 1024 * 1024;
const ID = /^[0-9A-Za-z]{20,40}$/;
const NAME = /^[\w.@-]{1,120}$/;

export const POST: APIRoute = async ({ request, locals, url }) => {
	if (!locals.user) return new Response("Sign in first", { status: 401 });
	// The admin's fetch helper sends this header; a cross-site form post can't.
	if (request.headers.get("x-emdash-request") !== "1") return new Response("Forbidden", { status: 403 });

	const id = url.searchParams.get("id") ?? "";
	const name = url.searchParams.get("name") ?? "";
	if (!ID.test(id) || !NAME.test(name)) return new Response("Bad id or name", { status: 400 });
	if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
		return new Response("Original too large", { status: 413 });
	}

	const body = await request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return new Response("Bad size", { status: 400 });

	const { env } = await import("cloudflare:workers");
	await env.ORIGINALS.put(`originals/${id}/${name}`, body, {
		httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
	});
	return new Response(null, { status: 204 });
};
