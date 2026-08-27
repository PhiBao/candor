import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@candor/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      "@candor/shared/mockLedger": path.resolve(__dirname, "../shared/src/mockLedger.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
