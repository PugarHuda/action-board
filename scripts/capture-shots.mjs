// Capture UI screenshots + a demo GIF from bundle/preview.html.
// Requires: a running `anna-app dev` harness (serves preview.html over http,
// needed because preview.html uses ES-module imports), and Chrome/Edge.
//
//   node scripts/capture-shots.mjs
//
// Env overrides: BASE (harness url), CHROME (browser path), OUT (output dir).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";
import pkg from "pngjs";
import gifenc from "gifenc";

const { PNG } = pkg;
const { GIFEncoder, quantize, applyPalette } = gifenc;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = process.env.OUT || join(ROOT, "docs");
const BASE = (process.env.BASE || "http://localhost:5180") + "/anna-apps/action-board/dev/preview.html";

const CHROME = process.env.CHROME ||
  ["/c/Program Files/Google/Chrome/Application/chrome.exe",
   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
   "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  .find((p) => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });

function shot(file, query, { w = 1120, h = 800, scale = 2 } = {}) {
  const url = `${BASE}${query}`;
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars",
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    `--screenshot=${join(OUT, file)}`,
    url,
  ], { stdio: "ignore" });
  console.log("  ✓", file, query || "(default)");
}

console.log("Browser:", CHROME);
console.log("Capturing variant screenshots…");
shot("screenshot.png", "");                                   // hero: full board (light/cream default)
shot("screenshot-dark.png", "?theme=dark");                   // dark theme variant
shot("screenshot-empty.png", "?step=1");                      // empty state
shot("screenshot-filtered.png", "?owner=Sara&sort=priority"); // filtered by owner
shot("screenshot-mobile.png", "", { w: 430, h: 880, scale: 2 }); // narrow / mobile

console.log("Capturing GIF frames (extract → approve → organize)…");
const FRAMES = ["?step=1", "?step=2", "?step=3", "?step=4"];
const W = 960, H = 620;
const framePaths = FRAMES.map((q, i) => {
  const f = join(OUT, `_frame${i}.png`);
  shot(`_frame${i}.png`, q, { w: W, h: H, scale: 1 });
  return f;
});

console.log("Encoding docs/demo.gif…");
const enc = GIFEncoder();
const delays = [1400, 1600, 1600, 2200]; // ms per beat
framePaths.forEach((f, i) => {
  const png = PNG.sync.read(readFileSync(f));
  const palette = quantize(png.data, 256);
  const index = applyPalette(png.data, palette);
  enc.writeFrame(index, png.width, png.height, { palette, delay: delays[i] || 1500 });
});
enc.finish();
writeFileSync(join(OUT, "demo.gif"), enc.bytes());
framePaths.forEach((f) => rmSync(f, { force: true }));
console.log("  ✓ docs/demo.gif");
console.log("Done.");
