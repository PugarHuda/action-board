// Replay test harness for the action-triage Executa.
// Spawns the Node plugin, drives it over stdio with real JSON-RPC frames,
// and asserts the contract. Runs the heuristic path (ACTION_TRIAGE_NO_SAMPLE)
// so it's deterministic and needs no host LLM. Run: `node tests/replay.mjs`.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PLUGIN = join(root, "executas", "triage-node", "plugin.js");
const NOTES = readFileSync(join(root, "fixtures", "sample-notes.txt"), "utf8");

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

// Send frames, collect responses keyed by id, resolve when we've seen `expectIds`.
function drive(frames, expectIds, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLUGIN], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const responses = new Map();
    let buf = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 10000);

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
          responses.set(msg.id, msg);
        }
        if (expectIds.every((id) => responses.has(id))) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          resolve(responses);
        }
      }
    });
    child.on("error", reject);
    for (const f of frames) child.stdin.write(JSON.stringify(f) + "\n");
  });
}

console.log("action-triage replay tests\n");

// --- 1. describe contract ---
const r1 = await drive([{ jsonrpc: "2.0", id: 1, method: "describe" }], [1]);
const manifest = r1.get(1)?.result;
ok("describe returns bare manifest with name", manifest?.name === "action-triage");
ok("manifest exposes extract_actions tool",
  Array.isArray(manifest?.tools) && manifest.tools.some((t) => t.name === "extract_actions"));
ok("notes param is required",
  manifest?.tools?.[0]?.parameters?.find((p) => p.name === "notes")?.required === true);

// --- 2. extraction over the fixture (heuristic path) ---
const r2 = await drive(
  [{ jsonrpc: "2.0", id: 2, method: "invoke",
     params: { tool: "extract_actions", invoke_id: "test", arguments: { notes: NOTES } } }],
  [2],
  { ACTION_TRIAGE_NO_SAMPLE: "1" },
);
const res = r2.get(2)?.result;
const items = res?.data?.items ?? [];
ok("invoke succeeds", res?.success === true);
ok("source is heuristic in offline mode", res?.data?.source === "heuristic");
ok("extracted several action items", items.length >= 5, `(got ${items.length})`);

const tasks = items.map((i) => i.task.toLowerCase());
const all = tasks.join(" | ");
ok("skips the shipped/FYI status line", !all.includes("shipped the search rewrite"));
ok("captures owner Sara", items.some((i) => i.owner === "Sara"));
ok("captures owner Tom", items.some((i) => i.owner === "Tom"));
ok("detects an 'urgent' item as high priority",
  items.some((i) => i.priority === "high"));
ok("strips leading '@Sara to' from task text",
  items.some((i) => i.task.toLowerCase().startsWith("send the revised")));
ok("strips leading 'Tom will' from task text",
  items.some((i) => i.task.toLowerCase().startsWith("fix the login")));
ok("every item has the 4 required fields",
  items.every((i) => "task" in i && "owner" in i && "deadline" in i && "priority" in i));

// --- 3. empty input is handled gracefully ---
const r3 = await drive(
  [{ jsonrpc: "2.0", id: 3, method: "invoke",
     params: { tool: "extract_actions", invoke_id: "t", arguments: { notes: "" } } }],
  [3],
  { ACTION_TRIAGE_NO_SAMPLE: "1" },
);
ok("empty notes returns success:false (no crash)", r3.get(3)?.result?.success === false);

// --- 4. unknown method -> -32601 ---
const r4 = await drive([{ jsonrpc: "2.0", id: 4, method: "frobnicate" }], [4]);
ok("unknown method returns -32601", r4.get(4)?.error?.code === -32601);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
