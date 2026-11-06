/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
	interface Env {
		/** Private bucket for untouched originals. */
		ORIGINALS: R2Bucket;
	}
}
