import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const dstDir = join(root, "public", "maplibre");

mkdirSync(dstDir, { recursive: true });

const files = [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl-worker.mjs.map",
  "maplibre-gl-shared.mjs.map",
];

for (const file of files) {
  const src = join(srcDir, file);
  const dst = join(dstDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dst);
  }
}
