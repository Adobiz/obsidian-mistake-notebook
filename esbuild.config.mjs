import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import esbuild from "esbuild";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

const banner = `/* ${pkg.name} v${pkg.version} — built with esbuild. Source maps embedded. */`;

/** 编译目标：Obsidian 插件（CommonJS 产物 main.js），外部化宿主 API 与编辑器包。 */
const shared = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    "node:fs",
    "node:path",
    "node:process",
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: "inline",
  treeShaking: true,
  outfile: "main.js",
  banner: { js: banner },
};

const production = process.argv[2] === "production";

if (production) {
  await esbuild.build({ ...shared, minify: true });
} else {
  const ctx = await esbuild.context(shared);
  await ctx.watch();
}
