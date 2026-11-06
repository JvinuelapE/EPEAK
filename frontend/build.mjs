// Bundles the React app into ../frontend/dist (served by the FastAPI backend).
//   node build.mjs          production build
//   node build.mjs --watch  rebuild on change (refresh the browser to pick up changes)
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });
copyFileSync("index.html", "dist/index.html");
copyFileSync("favicon.svg", "dist/favicon.svg");

const options = {
  entryPoints: { app: "src/main.tsx" },
  bundle: true,
  outdir: "dist/assets",
  format: "esm",
  target: ["chrome110", "edge110", "firefox115", "safari16"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  jsx: "automatic",
  loader: { ".svg": "text" },
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await esbuild.build(options);
}
