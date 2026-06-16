// Mock-host test for the action-triage Executa (Node flavour).
// This is the ONLY test that exercises the LLM/sampling path: we play the role
// of the Anna host, answer the plugin's `sampling/createMessage` reverse-RPC
// with canned content, and assert the plugin parses it (and falls back when the
// LLM misbehaves). Run: node tests/mock-host.test.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(__dirname, "..", "executas", "triage-node", "plugin.js");

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

// Spawn the plugin, send one `invoke`, and when it emits sampling/createMessage,
// reply with `samplerReply(promptText)`. Resolves with the plugin's invoke result.
function runWithMockLLM(notes, samplerReply, { id = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLUGIN], { stdio: ["pipe", "pipe", "ignore"] });
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

        // Plugin -> host reverse-RPC: a sampling request.
        if (msg.method === "sampling/createMessage") {
          // Real wire shape: messages[].content is { type:"text", text:"…" }.
          const mc = msg.params?.messages?.[0]?.content;
          const promptText = typeof mc === "string" ? mc : (mc?.text ?? "");
          const echoedInvoke = msg.params?.metadata?.invoke_id;
          const reply = samplerReply(promptText, echoedInvoke);
          if (reply === null) {
            // simulate an error response (tests fallback)
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32003, message: "provider error" } }) + "\n");
          } else if (typeof reply === "object" && reply.__rawContent !== undefined) {
            // let a test inject an arbitrary `content` shape (string/array/etc.)
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: reply.__rawContent, model: "mock", stopReason: "endTurn" } }) + "\n");
          } else {
            // default: the real { type:"text", text } block
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { role: "assistant", content: { type: "text", text: reply }, model: "mock", stopReason: "endTurn" } }) + "\n");
          }
          continue;
        }
        // Plugin -> host: the invoke response we're waiting for.
        if (msg.id === id && (msg.result !== undefined || msg.error !== undefined)) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          resolve(msg);
        }
      }
    });
    child.on("error", reject);
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id, method: "invoke",
      params: { tool: "extract_actions", invoke_id: "iv-123", arguments: { notes } },
    }) + "\n");
  });
}

console.log("mock-host (sampling) tests\n");

const NOTES = "- Sara: send the deck\n- fix the login bug";

// 1) Happy path: LLM returns clean JSON array.
{
  let sawInvokeId = null;
  let sawPrompt = "";
  const r = await runWithMockLLM(NOTES, (prompt, invokeId) => {
    sawInvokeId = invokeId;
    sawPrompt = prompt;
    return JSON.stringify([
      { task: "Send the deck", owner: "Sara", deadline: "Fri", priority: "high" },
      { task: "Fix the login bug", owner: "", deadline: "", priority: "medium" },
    ]);
  });
  const data = r.result?.data;
  ok("LLM path: success", r.result?.success === true);
  ok("LLM path: source = llm", data?.source === "llm");
  ok("LLM path: 2 items parsed", data?.items?.length === 2);
  ok("LLM path: fields preserved", data?.items?.[0]?.owner === "Sara" && data?.items?.[0]?.priority === "high");
  ok("LLM path: prompt (sent as {type,text}) contained the notes", sawPrompt.includes("fix the login bug"));
  ok("LLM path: invoke_id echoed in sampling metadata", sawInvokeId === "iv-123");
}

// 1b) Robustness: host returns content as a bare STRING instead of {type,text}.
{
  const r = await runWithMockLLM(NOTES, () => ({
    __rawContent: JSON.stringify([{ task: "Do the thing", owner: "", deadline: "", priority: "medium" }]),
  }));
  ok("string-shaped content still parsed", r.result?.data?.items?.[0]?.task === "Do the thing" && r.result?.data?.source === "llm");
}

// 1c) Robustness: host returns content as an ARRAY of text blocks.
{
  const r = await runWithMockLLM(NOTES, () => ({
    __rawContent: [{ type: "text", text: "[{\"task\":\"Block task\"," }, { type: "text", text: "\"owner\":\"\",\"deadline\":\"\",\"priority\":\"high\"}]" }],
  }));
  ok("array-of-blocks content concatenated + parsed", r.result?.data?.items?.[0]?.task === "Block task");
}

// 2) LLM wraps the array in a ```json code fence -> still parsed.
{
  const r = await runWithMockLLM(NOTES, () =>
    "```json\n[{\"task\":\"Ship it\",\"owner\":\"\",\"deadline\":\"\",\"priority\":\"low\"}]\n```");
  ok("code-fenced JSON parsed", r.result?.data?.items?.length === 1);
  ok("code-fenced item correct", r.result?.data?.items?.[0]?.task === "Ship it");
  ok("code-fenced source = llm", r.result?.data?.source === "llm");
}

// 3) LLM returns prose / garbage (no JSON) -> fall back to heuristic.
{
  const r = await runWithMockLLM(NOTES, () => "Sure! Here are the action items you asked for.");
  ok("garbage LLM -> heuristic fallback", r.result?.data?.source === "heuristic");
  ok("garbage LLM -> still returns items", r.result?.data?.items?.length >= 1);
}

// 4) LLM returns an empty array -> treated as failure -> heuristic fallback.
{
  const r = await runWithMockLLM(NOTES, () => "[]");
  ok("empty LLM array -> heuristic fallback", r.result?.data?.source === "heuristic");
}

// 5) Host returns a sampling ERROR -> heuristic fallback.
{
  const r = await runWithMockLLM(NOTES, () => null);
  ok("sampling error -> heuristic fallback", r.result?.data?.source === "heuristic");
  ok("sampling error -> success still true", r.result?.success === true);
}

// 6) LLM returns items missing required fields -> filtered/normalized.
{
  const r = await runWithMockLLM(NOTES, () => JSON.stringify([
    { task: "Keep me", priority: "weird" },   // invalid priority -> medium
    { owner: "no task here" },                  // no task -> dropped
    { task: "" },                               // empty task -> dropped
  ]));
  const items = r.result?.data?.items ?? [];
  ok("malformed LLM items normalized", items.length === 1 && items[0].task === "Keep me");
  ok("invalid priority normalized to medium", items[0]?.priority === "medium");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
