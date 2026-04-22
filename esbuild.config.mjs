import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const dist = path.join(__dirname, "dist");

/** Safe to embed inside <script>…</script> in HTML. */
function escapeForInlineScript(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

/** Avoid closing the <style> block early if CSS contains `</style`. */
function escapeForInlineStyle(css) {
  return css.replace(/<\/style/gi, "<\\/style");
}

async function buildInlineUiHtml() {
  const css = await fs.promises.readFile(path.join(dist, "ui.css"), "utf8");
  let js = await fs.promises.readFile(path.join(dist, "ui.js"), "utf8");
  js = escapeForInlineScript(js);
  const safeCss = escapeForInlineStyle(css);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sarina Handoff Cleanup AI</title>
  <style>${safeCss}</style>
</head>
<body>
  <div id="app"></div>
  <script>${js}</script>
</body>
</html>`;
}

async function build() {
  await fs.promises.mkdir(dist, { recursive: true });

  await fs.promises.copyFile(
    path.join(__dirname, "src", "ui.css"),
    path.join(dist, "ui.css")
  );

  await esbuild.build({
    entryPoints: [path.join(__dirname, "src", "ui.ts")],
    bundle: true,
    outfile: path.join(dist, "ui.js"),
    format: "iife",
    target: "es2017",
    platform: "browser",
    logLevel: "info",
    loader: {
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".png": "dataurl",
      ".webp": "dataurl",
    },
  });

  const inlineHtml = await buildInlineUiHtml();
  await fs.promises.writeFile(path.join(dist, "ui.html"), inlineHtml, "utf8");

  await esbuild.build({
    entryPoints: [path.join(__dirname, "src", "code.ts")],
    bundle: true,
    outfile: path.join(dist, "code.js"),
    format: "iife",
    target: "es2017",
    platform: "browser",
    logLevel: "info",
    define: {
      __html__: JSON.stringify(inlineHtml),
    },
  });
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

async function main() {
  if (watch) {
    await build();
    const debounced = debounce(() => {
      build().catch((e) => {
        console.error(e);
      });
    }, 200);
    fs.watch(path.join(__dirname, "src"), { recursive: true }, debounced);
    console.log("Watching src/… (rebuilds on change)");
  } else {
    await build();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
