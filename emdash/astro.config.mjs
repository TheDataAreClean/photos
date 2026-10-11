import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { memoriesPlugin } from "memories-plugin";

// Cloudflare Workers + D1 + R2. `npm run dev` runs the same bindings locally
// (state in .wrangler/), so local and deployed behave alike.
export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	server: { port: 4321 },
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [memoriesPlugin()],
		}),
	],
	devToolbar: { enabled: false },
});
