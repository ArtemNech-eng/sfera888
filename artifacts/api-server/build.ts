import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Packages that cannot be bundled (e.g. native modules, packages with
// dynamic require patterns that esbuild can't resolve at build time).
// Everything in `dependencies` is bundled unless listed here.
const bundleBlocklist: string[] = [];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

  // Bundle all regular dependencies except workspace packages and blocklisted ones.
  // Externalize devDependencies (types, build tools) — they are not needed at runtime.
  const runtimeDeps = Object.keys(pkg.dependencies || {}).filter(
    (dep) =>
      !pkg.dependencies[dep].startsWith("workspace:") &&
      !bundleBlocklist.includes(dep),
  );
  const devDeps = Object.keys(pkg.devDependencies || {});
  // externals = devDeps not being bundled + explicitly blocklisted runtime deps
  const externals = [
    ...devDeps.filter((dep) => !runtimeDeps.includes(dep)),
    ...bundleBlocklist,
  ];

  console.log("bundling:", runtimeDeps.join(", "));
  console.log("external:", externals.join(", "));

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "__importMetaUrl",
    },
    banner: {
      js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
