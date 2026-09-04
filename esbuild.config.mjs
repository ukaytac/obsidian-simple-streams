import esbuild from "esbuild";
import process from "node:process";
// Node's own list, rather than the `builtin-modules` package the Obsidian
// sample plugin uses: same answer from the runtime that defines it, one fewer
// dependency. It omits the `node:` prefix, and an import written with the
// prefix is a different specifier to esbuild, so both spellings are marked
// external below.
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
