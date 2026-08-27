import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@candor\/shared\/hash$/, replacement: path.resolve(__dirname, "../shared/src/hash.ts") },
      { find: /^@candor\/shared\/mockLedger$/, replacement: path.resolve(__dirname, "../shared/src/mockLedger.ts") },
      { find: /^@candor\/shared$/, replacement: path.resolve(__dirname, "../shared/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
  },
});
