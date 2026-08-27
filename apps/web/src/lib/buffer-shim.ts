// Node Buffer polyfill for the browser.
// Midnight.js internals (hex codecs, transaction serialization) reference the
// Node `Buffer` global; Vite does not provide it. Import this BEFORE anything
// that touches @midnight-ntwrk/*.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) {
  g.Buffer = Buffer;
}

export {};
