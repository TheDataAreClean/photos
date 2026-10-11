import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

// Local experiment: SQLite + local file storage. The Cloudflare variant
// (D1 + R2) swaps the adapter and these two lines — see README.md.
export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	server: { port: 4321 },
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	devToolbar: { enabled: false },
});
