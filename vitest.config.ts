import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // apps/web imports its own modules as "@/..." (its tsconfig paths); nothing else does.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./apps/web/", import.meta.url)) }],
  },
});
