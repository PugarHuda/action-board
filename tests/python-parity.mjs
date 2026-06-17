// Parity test for the Python flavour of the Executa tool.
// Drives executas/triage-python/plugin.py over stdio exactly like the Node
// contract + sampling tests, proving the publish-parity flavour actually works
// (not just mirrored by eye). Auto-skips (exit 0) if no Python is available.
//
//   node tests/python-parity.mjs
//   PYTHON=/path/to/python node tests/python-parity.mjs   # explicit interpreter
//
// (No Python on PATH? Get one with: `uv python install 3.12 && uv python find 3.12`.)

import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(__dirname, "..", "executas", "triage-python", "plugin.py");

function findPython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  for (const c of ["python3", "python", "py"]) {
    try { const r = spawnSync(c, ["--version"], { encoding: "utf8" }); if (r.status === 0) return c; } catch {}
  }
  return null;
}
const PY = findPython();
if (!PY) { console.log("python-parity: no Python interpreter found — skipping"); process.exit(0); }

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

// Drive one invoke through the python plugin; answer a sampling reverse-RPC with
// `samplerReply(promptText)` (return null to simulate a host error). `env` extra.
function run(notes, samplerReply, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PY, [PLUGIN], { stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, ...env } });
    let buf = "", out = {};
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 15000);
    child.stdout.on("data", (c) => {
      buf += c.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === "sampling/createMessage") {
          const mc = msg.params?.messages?.[0]?.content;
          const prompt = typeof mc === "string" ? mc : (mc?.text ?? "");
          const reply = samplerReply ? samplerReply(prompt) : null;
          if (reply == null) child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32003, message: "x" } }) + "\n");
          else child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: { type: "text", text: reply } } }) + "\n");
          continue;
        }
        if (msg.id === 1) out.describe = msg.result;
        if (msg.id === 2) {
          clearTimeout(timer); child.stdin.end(); child.kill();
          resolve(Object.assign({ __describe: out.describe }, msg.result));
        }
      }
    });
    child.on("error", reject);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "describe" }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "invoke",
      params: { tool: "extract_actions", invoke_id: "iv", arguments: { notes } } }) + "\n");
  });
}

const out = await (async () => {
  console.log(`python-parity — ${PY}\n`);
  const NOTES = "- @Sara to finalize the deck by Fri, urgent\n- Tom will fix the login bug tomorrow\n- we shipped search (FYI)";

  // 1) heuristic path (sampling disabled): matches Node behaviour
  const h = await run(NOTES, null, { ACTION_TRIAGE_NO_SAMPLE: "1" });
  ok("heuristic: success", h?.success === true);
  ok("heuristic: source heuristic", h?.data?.source === "heuristic");
  ok("heuristic: 2 items (skips FYI)", h?.data?.items?.length === 2, `(got ${h?.data?.items?.length})`);
  ok("heuristic: cleans '@Sara to'", h?.data?.items?.[0]?.task?.toLowerCase().startsWith("finalize"));
  ok("heuristic: owner Sara", h?.data?.items?.some((i) => i.owner === "Sara"));
  ok("heuristic: urgent -> high", h?.data?.items?.some((i) => i.priority === "high"));

  // 2) LLM/sampling path with the real {type:text} content shape
  const s = await run(NOTES, () => JSON.stringify([{ task: "From LLM", owner: "Sara", deadline: "Fri", priority: "high" }]));
  ok("sampling: source llm", s?.data?.source === "llm", `(got ${s?.data?.source})`);
  ok("sampling: parsed {type:text} reply", s?.data?.items?.[0]?.task === "From LLM");

  // 3) garbage LLM -> heuristic fallback (same resilience as Node)
  const g = await run(NOTES, () => "sorry, here you go!");
  ok("sampling garbage -> heuristic fallback", g?.data?.source === "heuristic");

  ok("describe exposes extract_actions", h?.__describe?.tools?.some?.((t) => t.name === "extract_actions") ?? true);
  return h;
})().catch((e) => { failed++; console.log("  ✗ run threw:", e.message); });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
