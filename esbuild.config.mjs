import { readFileSync, rmSync } from "node:fs";
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
  // styles.css 以文本形式打进 main.js，由插件运行时注入 <style>：
  // 部分环境下 Obsidian 不会随文件更新重读插件的 styles.css，打包注入可保证
  // 样式与代码同生命周期（styles.css 文件本身保留，作为商店规范与兜底）。
  loader: { ".css": "text" },
};

const production = process.argv[2] === "production";

if (production) {
  await esbuild.build({ ...shared, minify: true });
  // css-as-text 时 esbuild 仍会吐出一份冗余的 css chunk，清掉
  rmSync("main.css", { force: true });
} else {
  const ctx = await esbuild.context(shared);
  await ctx.watch();
}
