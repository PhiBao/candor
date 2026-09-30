import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@gotit\/shared\/hash$/, replacement: path.resolve(__dirname, "../shared/src/hash.ts") },
      { find: /^@gotit\/shared\/mockLedger$/, replacement: path.resolve(__dirname, "../shared/src/mockLedger.ts") },
      { find: /^@gotit\/shared$/, replacement: path.resolve(__dirname, "../shared/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
  },
});
