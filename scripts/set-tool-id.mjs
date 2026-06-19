#!/usr/bin/env node
// Rewire the minted Executa tool_id across the project.
//
// Usage:  node scripts/set-tool-id.mjs tool-<handle>-action-triage-<uniq>
//
// Anna mints tool_id server-side (Executa platform → My Tools → Create Tool →
// Mint). The repo ships the dev placeholder `tool-dev-action-triage`; run this
// once with the real minted id before `anna-app apps push`. Re-runs are safe
// (idempotent) — it replaces whatever publish-facing id is currently wired.
//
// What it touches (publish-facing only; the manifest `dev` block keeps the dev
// id so local `anna-app dev` still works):
//   - manifest.json            → required_executas[0].tool_id
//   - bundle/app.js            → const TOOL_ID = "…"
//   - executas/triage-node/executa.json     → tool_id
//   - executas/triage-node/package.json     → name, bin{}, main, executa.tool_id
//   - executas/triage-python/executa.json   → tool_id

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL_ID = (process.argv[2] || "").trim();

const ID_RE = /^tool-[a-z0-9]+(?:-[a-z0-9]+)+$/i;
if (!ID_RE.test(TOOL_ID)) {
  console.error(`✗ invalid tool_id: ${JSON.stringify(TOOL_ID)}`);
  console.error("  expected something like  tool-<handle>-action-triage-<uniq>");
  process.exit(1);
}

const p = (...a) => join(ROOT, ...a);
const readJSON = (f) => JSON.parse(readFileSync(f, "utf8"));
const writeJSON = (f, o) => writeFileSync(f, JSON.stringify(o, null, 2) + "\n");
const changes = [];

// 1) manifest.json — required_executas[0].tool_id (leave dev + ui.host_api.tools alone)
{
  const f = p("manifest.json");
  const m = readJSON(f);
  const prev = m.required_executas?.[0]?.tool_id;
  if (prev !== TOOL_ID) {
    m.required_executas[0].tool_id = TOOL_ID;
    writeJSON(f, m);
    changes.push(`manifest.json: required_executas → ${prev} → ${TOOL_ID}`);
  }
}

// 2) bundle/app.js — const TOOL_ID = "…"
{
  const f = p("bundle", "app.js");
  const src = readFileSync(f, "utf8");
  const next = src.replace(/const TOOL_ID = "[^"]*";/, `const TOOL_ID = "${TOOL_ID}";`);
  if (next !== src) { writeFileSync(f, next); changes.push(`bundle/app.js: TOOL_ID → ${TOOL_ID}`); }
}

// 3) executas/triage-node/executa.json
// 5) executas/triage-python/executa.json
for (const dir of ["triage-node", "triage-python"]) {
  const f = p("executas", dir, "executa.json");
  const j = readJSON(f);
  if (j.tool_id !== TOOL_ID) { j.tool_id = TOOL_ID; writeJSON(f, j); changes.push(`executas/${dir}/executa.json: tool_id → ${TOOL_ID}`); }
}

// 4) executas/triage-node/package.json — align identity to the minted id
{
  const f = p("executas", "triage-node", "package.json");
  const pk = readJSON(f);
  pk.name = TOOL_ID;
  pk.bin = { [TOOL_ID]: "plugin.js" };
  pk.main = "plugin.js";
  pk.executa = { tool_id: TOOL_ID };
  writeJSON(f, pk);
  changes.push(`executas/triage-node/package.json: name/bin/main/executa → ${TOOL_ID}`);
}

if (!changes.length) console.log(`✓ already wired to ${TOOL_ID} — nothing to do`);
else { console.log(`✓ rewired to ${TOOL_ID}:`); for (const c of changes) console.log("  - " + c); }
console.log("\nnext: anna-app validate --strict  &&  anna-app apps push");
