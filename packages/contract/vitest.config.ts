import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // Order matters: the specific subpath entries must precede the bare
      // "@gotit/shared" one, or they resolve to the package root and every
      // named import comes back undefined (which is how DEFAULT_K silently
      // became undefined and every test failed at BigInt(undefined)).
      { find: /^@gotit\/shared\/hash$/, replacement: path.resolve(__dirname, "../shared/src/hash.ts") },
      { find: /^@gotit\/shared\/paygap$/, replacement: path.resolve(__dirname, "../shared/src/paygap.ts") },
      { find: /^@gotit\/shared\/mockLedger$/, replacement: path.resolve(__dirname, "../shared/src/mockLedger.ts") },
      { find: /^@gotit\/shared$/, replacement: path.resolve(__dirname, "../shared/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
  },
});
