// Browser smoke test — drives the REAL app (bundle/app.js) inside a running
// `anna-app dev` harness via puppeteer-core + the system Chrome. This is the only
// test that exercises the DOM wiring end-to-end (SDK connect, render, extract,
// theme/lang toggle, quick-add, persistence) and catches uncaught JS errors.
//
// Skips cleanly (exit 0) if no harness is running or no Chrome is found.
// Run: node tests/ui-smoke.mjs   (start harness first: anna-app dev --no-llm)

import { existsSync } from "node:fs";
import process from "node:process";

const BASE = process.env.ANNA_DEV_URL || "http://localhost:5180";
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

async function up() {
  try { return (await fetch(BASE + "/")).ok; } catch { return false; }
}

if (!CHROME) { console.log("ui-smoke: no Chrome/Edge found — skipping"); process.exit(0); }
if (!(await up())) { console.log(`ui-smoke: no harness at ${BASE} — skipping (anna-app dev --no-llm)`); process.exit(0); }

let puppeteer;
try { puppeteer = (await import("puppeteer-core")).default; }
catch { console.log("ui-smoke: puppeteer-core not installed — skipping"); process.exit(0); }

console.log(`ui-smoke (browser) — ${CHROME.split(/[\\/]/).pop()} @ ${BASE}\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("dialog", (d) => d.accept().catch(() => {})); // auto-accept the Clear confirm()

async function appFrame(timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = page.frames().find((fr) => fr.url().includes("/anna-apps/action-board/dev/"));
    if (f) return f;
    await sleep(300);
  }
  throw new Error("app iframe not found");
}
const isReady = () => {
  const s = document.querySelector("#status");
  return !!s && /Ready|Siap/.test(s.textContent);
};

try {
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 20000 });
  let f = await appFrame();
  await f.waitForFunction(isReady, { timeout: 15000 });
  ok("app iframe mounts & SDK connects (status Ready)", true);

  // start from a clean board
  const hadCards = (await f.$$(".card")).length > 0;
  if (hadCards) { await f.click("#clearBtn"); await sleep(400); }
  ok("empty state shown on empty board", await f.$eval("#empty", (e) => e.style.display !== "none"));

  // extract
  const NOTES = "- @Sara to finalize the deck by Fri, urgent\n- Tom will fix the login bug tomorrow\n- we shipped search (FYI)";
  await f.$eval("#notes", (el, v) => { el.value = v; }, NOTES);
  await f.click("#extractBtn");
  await f.waitForSelector(".card", { timeout: 8000 });
  const n = (await f.$$(".card")).length;
  ok("extract renders cards", n >= 2, `(got ${n})`);
  ok("skips the FYI line", n === 2, `(got ${n})`);
  const todo = await f.$eval('.count[data-count="todo"]', (e) => e.textContent);
  ok("To Do count reflects cards", Number(todo) === n, `(count=${todo})`);

  // theme toggle
  const themeBefore = await f.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await f.click("#themeBtn"); await sleep(250);
  const themeAfter = await f.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("theme toggle flips data-theme", themeBefore !== themeAfter, `(${themeBefore}→${themeAfter})`);

  // language toggle (EN -> ID): the Clear button label becomes "Bersihkan"
  await f.click("#langBtn"); await sleep(250);
  const clearTxt = await f.$eval("#clearBtn", (e) => e.textContent.trim());
  ok("language toggle localizes UI (ID)", clearTxt === "Bersihkan", `(clearBtn="${clearTxt}")`);
  await f.click("#langBtn"); await sleep(150); // back to EN

  // quick-add
  const before = (await f.$$(".card")).length;
  await f.type("#quickAddInput", "Call the bank tomorrow");
  await f.click('#quickAdd button[type="submit"]'); await sleep(400);
  const after = (await f.$$(".card")).length;
  ok("quick-add adds a card", after === before + 1, `(${before}→${after})`);

  // every card is tagged with a source badge (parser / manual)
  const badges = (await f.$$(".src:not([hidden])")).length;
  ok("cards show a source badge", badges === after, `(${badges}/${after})`);

  // chat write-back from the real UI (chat.append_artifact + write_message)
  await f.click("#summaryBtn");
  await f.waitForFunction(
    () => /✓|chat/i.test(document.querySelector("#extractHint")?.textContent || ""),
    { timeout: 6000 },
  ).catch(() => {});
  const hint = await f.$eval("#extractHint", (e) => e.textContent);
  ok("send-summary-to-chat succeeds", /✓|chat/i.test(hint), `(hint="${hint}")`);

  // Note: cross-reload persistence needs `anna-app dev --storage aps`; the local
  // legacy backend is per-window. The storage.set/get round-trip itself is proven
  // by the e2e suite, and the write path here is covered by "no uncaught JS errors".
  console.log("  · note: cross-reload persistence needs `--storage aps` (legacy storage is per-window)");

  // no uncaught JS errors anywhere in app.js
  ok("no uncaught JS errors", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));
} catch (e) {
  failed++;
  console.log("  ✗ smoke run threw:", e.message);
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
