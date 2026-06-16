// End-to-end test against a running `anna-app dev` harness.
// Drives the harness session API the same way the iframe SDK does, exercising
// the full board lifecycle: storage round-trip, chat write-back, window title,
// tools.list. Skips cleanly (exit 0) if no harness is running on $PORT.
// Run: node tests/e2e-harness.test.mjs    (start harness first: anna-app dev --no-llm)

import process from "node:process";

const BASE = process.env.ANNA_DEV_URL || "http://localhost:5180";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

async function up() {
  try {
    const r = await fetch(BASE + "/", { method: "GET" });
    return r.ok;
  } catch { return false; }
}

if (!(await up())) {
  console.log(`e2e-harness: no harness at ${BASE} — skipping (start with \`anna-app dev --no-llm\`)`);
  process.exit(0);
}

console.log(`e2e-harness tests (${BASE})\n`);

const sess = await (await fetch(BASE + "/api/session/create", { method: "POST" })).json();
ok("session created", !!sess.session_id, JSON.stringify(sess));
const SID = sess.session_id;

async function call(ns, method, args) {
  const r = await fetch(BASE + "/api/session/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: SID, ns, method, args: args ?? {} }),
  });
  return r.json();
}

// unique key per run so reruns don't collide
const KEY = "test.board." + (sess.window_uuid || SID);
const board = [
  { id: "a1", task: "Send the deck", owner: "Sara", deadline: "Fri", priority: "high", status: "todo", approved: false },
  { id: "a2", task: "Fix the login bug", owner: "Tom", deadline: "tomorrow", priority: "medium", status: "done", approved: true },
];

// --- storage round-trip ---
const setRes = await call("storage", "set", { key: KEY, value: board });
ok("storage.set ok", setRes.ok === true, JSON.stringify(setRes));

const getRes = await call("storage", "get", { key: KEY });
ok("storage.get returns the board", getRes.ok && Array.isArray(getRes.result?.value) && getRes.result.value.length === 2);
ok("storage.get preserves item fields",
  getRes.result?.value?.[0]?.task === "Send the deck" && getRes.result?.value?.[1]?.approved === true);

const listRes = await call("storage", "list", { prefix: "test.board." });
ok("storage.list includes our key", listRes.ok && listRes.result?.items?.some((i) => i.key === KEY));

// --- chat write-back ---
const art = await call("chat", "append_artifact", {
  artifact: { kind: "action_board", app_slug: "action-board", summary: "2 items", data: { items: board } },
});
ok("chat.append_artifact returns artifact_id", art.ok && typeof art.result?.artifact_id === "string");

const msg = await call("chat", "write_message", { role: "assistant", content: "**Action Board summary**\n• Send the deck — @Sara (Fri) [high]" });
ok("chat.write_message returns message_id", msg.ok && typeof msg.result?.message_id === "string");

// --- window ---
const title = await call("window", "set_title", { title: "Action Board · 1 open · 1 done" });
ok("window.set_title ok", title.ok === true);

// --- tools ---
const tools = await call("tools", "list", {});
ok("tools.list exposes action-triage",
  tools.ok && tools.result?.tools?.some((t) => t.tool_id === "tool-dev-action-triage"));

// tools.invoke is documented but not implemented in the MVP harness — assert the
// known behavior so this test flags it the day the harness starts supporting it.
const inv = await call("tools", "invoke", { tool_id: "tool-dev-action-triage", method: "extract_actions", args: { notes: "- fix it" } });
ok("tools.invoke behaves as expected (impl OR documented not_implemented)",
  inv.ok === true || inv.error?.code === "not_implemented",
  JSON.stringify(inv));
if (inv.ok) console.log("    note: tools.invoke is NOW implemented in this harness — UI tool path is fully live.");
else console.log("    note: tools.invoke not_implemented (expected on MVP harness) — UI uses in-browser parser locally.");

// --- cleanup ---
const del = await call("storage", "delete", { key: KEY });
ok("storage.delete ok", del.ok === true);
const after = await call("storage", "get", { key: KEY });
ok("deleted key no longer returns a value",
  !after.result?.value || (Array.isArray(after.result.value) ? false : true) || after.result?.exists === false,
  JSON.stringify(after.result));

console.log(`\n${passed} passed, ${failed} failed`);
// Set exit code but DON'T call process.exit(): on Windows, exiting while undici
// keep-alive sockets are open triggers a libuv handle-close assertion. Closing
// the dispatcher lets the event loop drain and Node exit cleanly on its own.
process.exitCode = failed ? 1 : 0;
try {
  const u = await import("undici");
  await u.getGlobalDispatcher?.()?.close?.();
} catch { /* not importable — loop drains on the keep-alive timeout instead */ }
