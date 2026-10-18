import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: true,
  metafile: true,
  // Some bundled CommonJS dependencies call require(); an ESM bundle has no require of its own.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, out) => sum + out.bytes, 0);
console.log(
  `Built apps/notary/dist/index.mjs (${(bytes / 1024 / 1024).toFixed(1)} MB with sourcemap)`,
);
