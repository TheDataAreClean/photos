/**
 * Memories plugin — the photo upload path.
 *
 * - `photo-upload` field widget (admin.tsx): reads EXIF in the browser,
 *   re-encodes through a canvas (drops every metadata block, GPS included),
 *   burns in the watermark, then uploads. The raw file never leaves the
 *   browser, so nothing with GPS reaches the public media store.
 * - `content:beforeSave`: fills empty EXIF fields on a photo from the EXIF
 *   the widget stashed on the image value. Blank means "use the EXIF", the
 *   same rule the sidecars had.
 */
import type { PluginDescriptor } from "emdash";
import { definePlugin } from "emdash";

import { fillFromExif } from "./exif.js";

const PLUGIN_ID = "memories";
const PLUGIN_VERSION = "0.1.0";

export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["content:write"],
		hooks: {
			"content:beforeSave": async (event) => {
				if (event.collection !== "photos") return;
				return fillFromExif(event.content);
			},
		},
		admin: {
			entry: "memories-plugin/admin",
			fieldWidgets: [{ name: "photo-upload", label: "Photo upload", fieldTypes: ["image"] }],
		},
	});
}

export default createPlugin;

export function memoriesPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: "memories-plugin",
		options: {},
		adminEntry: "memories-plugin/admin",
	};
}
