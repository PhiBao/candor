import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), wasm()],
  optimizeDeps: {
    esbuildOptions: {
      // Midnight's level-private-state-provider extends Node's EventEmitter;
      // vite's dev externalization of the `events`/`assert` builtins yields
      // undefined for class extends — substitute real polyfills at pre-bundle time.
      alias: {
        events: path.resolve(__dirname, "node_modules/events/events.js"),
      },
    },
  },
  resolve: {
    alias: [
      {
        // isomorphic-ws's browser build lacks the named `WebSocket` export used by
        // the Midnight indexer provider; shim it with the browser global.
        find: /^isomorphic-ws$/,
        replacement: path.resolve(__dirname, "src/lib/ws-shim.ts"),
      },
    ],
  },
  server: {
    proxy: {
      "/issuer": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/issuer/, ""),
      },
    },
  },
  build: {
    // Midnight runtime wasm uses top-level await — requires a modern target
    target: "es2022",
    // Midnight runtime wasm + proving keys make the chunk large; silence the warning
    chunkSizeWarningLimit: 1500,
  },
});
