// Aggregate test runner. Runs every suite, prints a summary, exits non-zero on
// any failure. The harness E2E suite self-skips if no `anna-app dev` is running.
// Run: node tests/run-all.mjs   (or: npm test)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ["parser (unit)", "parser.test.mjs"],
  ["board logic (unit)", "board.test.mjs"],
  ["i18n (unit)", "i18n.test.mjs"],
  ["executa stdio contract", "replay.mjs"],
  ["sampling / mock-host", "mock-host.test.mjs"],
  ["harness E2E (auto-skips if down)", "e2e-harness.test.mjs"],
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, file)], { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

let failures = 0;
for (const [label, file] of SUITES) {
  console.log(`\n${"=".repeat(60)}\n▶ ${label}\n${"=".repeat(60)}`);
  const code = await run(file);
  if (code !== 0) { failures++; console.log(`✗ suite failed: ${label} (exit ${code})`); }
}

console.log(`\n${"=".repeat(60)}`);
console.log(failures ? `✗ ${failures} suite(s) failed` : "✓ all suites passed");
process.exit(failures ? 1 : 0);
