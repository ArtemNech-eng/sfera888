import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In dev:  __dirname = artifacts/api-server/src
// In prod: __dirname = artifacts/api-server/dist  (esbuild bundles to dist/index.cjs)
// Going one level up lands at api-server/ in both cases.
export const UPLOAD_BASE = path.join(__dirname, "../public/uploads");
export const AVATAR_DIR = path.join(UPLOAD_BASE, "avatars");
