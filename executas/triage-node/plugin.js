#!/usr/bin/env node
// Action Triage — Anna Executa (Tool), Node.js flavour.
// Same JSON-RPC contract as the Python version. JSON-RPC 2.0 over stdio.
// stdout = protocol only; logs -> stderr; flush per line; loop until EOF.

const readline = require("readline");

function log(...a) { process.stderr.write(a.map(String).join(" ") + "\n"); }
function write(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
function sendResult(id, result) { write({ jsonrpc: "2.0", id, result }); }
function sendError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  write({ jsonrpc: "2.0", id, error });
}

const MANIFEST = {
  name: "action-triage",
  display_name: "Action Triage",
  version: "0.1.0",
  description: "Extract structured action items (task, owner, deadline, priority) from raw notes.",
  tools: [
    {
      name: "extract_actions",
      description:
        "Read raw meeting notes or a brain-dump and return a list of structured action " +
        "items. Each item has: task, owner, deadline, priority (high|medium|low).",
      parameters: [
        { name: "notes", type: "string", description: "The raw notes / transcript / brain-dump.", required: true },
        { name: "context", type: "string", description: "Optional context (team, topic).", required: false },
      ],
      timeout: 60,
    },
  ],
  credentials: [],
  host_capabilities: ["llm.sample"],
  runtime: { type: "node", min_version: "18.0.0" },
  author: "Hackathon Submission",
};

// ---- reverse-RPC sampling (borrow the host LLM) ----------------------------
// A simple correlation map keyed by request id; resolved when the matching
// response line arrives in the main loop.
let revId = 9000;
const pending = new Map();

// Anna returns sampling content as { type:"text", text:"…" }, but be liberal:
// accept a bare string or an array of content blocks too.
function extractText(result) {
  const c = result && result.content;
  if (typeof c === "string") return c;
  if (c && typeof c.text === "string") return c.text;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "string" ? b : b && b.text) || "").join("");
  return "";
}

function hostSample(prompt, maxTokens, invokeId) {
  return new Promise((resolve, reject) => {
    const id = ++revId;
    pending.set(id, { resolve, reject });
    write({
      jsonrpc: "2.0",
      id,
      method: "sampling/createMessage",
      params: {
        // content as a typed block — matches the host wire format.
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens,
        metadata: { invoke_id: invokeId },
      },
    });
    // Guard: if the host never answers, fall back after 8s.
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error("sampling timeout")); }
    }, 8000);
  });
}

const EXTRACTION_PROMPT = (notes, context) =>
  `You are a precise meeting-notes triage assistant.
Read the NOTES and extract concrete action items only (skip status updates and FYIs).

Return ONLY a JSON array, no prose, no code fences. Each element:
{"task":"<imperative, concise>","owner":"<name or empty>","deadline":"<as written or empty>","priority":"high"|"medium"|"low"}

CONTEXT: ${context || "(none)"}

NOTES:
${notes}`;

function parseJsonItems(content) {
  let text = String(content).trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no JSON array in LLM output");
  const data = JSON.parse(text.slice(start, end + 1));
  const items = [];
  for (const it of data) {
    if (!it || typeof it !== "object") continue;
    const task = String(it.task || "").trim();
    if (!task) continue;
    let prio = String(it.priority || "medium").toLowerCase();
    if (!["high", "medium", "low"].includes(prio)) prio = "medium";
    items.push({
      task,
      owner: String(it.owner || "").trim(),
      deadline: String(it.deadline || "").trim(),
      priority: prio,
    });
  }
  return items;
}

// ---- heuristic fallback (no LLM needed) ------------------------------------
const ACTION_VERBS = [
  "send", "email", "call", "write", "draft", "review", "fix", "ship", "build",
  "create", "update", "schedule", "book", "prepare", "follow", "finish",
  "deploy", "test", "investigate", "research", "design", "deliver", "share",
  "set up", "setup", "add", "remove", "check", "finalize", "rotate", "migrate",
  "wire", "plan", "coordinate", "approve", "merge", "refactor", "document",
  "organize", "audit", "upgrade",
];
const HIGH = ["urgent", "asap", "critical", "blocker", "today", "p0", "p1", "!!"];
const LOW = ["someday", "nice to have", "low priority", "eventually", "backlog"];
const CHATTER = ["lol", "haha", "thanks", "thank you", "great job", "good job", "nice work", "kudos", "shoutout"];
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|in \d+ (day|week)s?|today|tomorrow|tonight|eod|next (week|month)|this (week|month)|end of (the )?(week|month|day)|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b(\s+(the\s+)?\d{1,2}(st|nd|rd|th)?)?/i;
const OWNER_AT = /@([A-Za-z][\w-]*)/;
const OWNER_ASSIGN = /\b([A-Z][a-z]+)\s+(?:to|will|should|needs to|is going to)\b/;

function cleanTask(text) {
  let t = String(text)
    .replace(/^@[A-Za-z][\w-]*\s+(?:to|will|should|needs to|is going to)\s+/i, "")
    .replace(/^@[A-Za-z][\w-]*[:\s]+/, "")
    .replace(/^[A-Z][a-z]+\s+(?:to|will|should|needs to|is going to)\s+/, "")
    .replace(/[\s,;\-]+(urgent|asap|critical|p0|p1|!!)\.?$/i, "")
    .trim()
    .replace(/\.$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function heuristicExtract(notes) {
  const items = [];
  for (const raw of String(notes).split(/\r?\n/)) {
    const line = raw.replace(/^[-*•–\s\t]+/, "").trim();
    if (line.length < 4) continue;
    const low = line.toLowerCase();
    if (CHATTER.some((c) => low.startsWith(c))) continue;
    const isAction =
      ACTION_VERBS.some((v) => low.startsWith(v) || (" " + low + " ").includes(" " + v + " ")) ||
      low.includes("todo") ||
      low.includes("action item") ||
      low.startsWith("[ ]") ||
      low.includes("follow up");
    if (!isAction) continue;

    let owner = "";
    const mAt = line.match(OWNER_AT);
    if (mAt) owner = mAt[1];
    else { const mAs = line.match(OWNER_ASSIGN); if (mAs) owner = mAs[1]; }

    let deadline = "";
    const md = line.match(DATE_RE);
    if (md) deadline = md[0].trim();

    let priority = "medium";
    if (HIGH.some((k) => low.includes(k))) priority = "high";
    else if (LOW.some((k) => low.includes(k))) priority = "low";

    let task = line.replace(/^\[\s?\]\s*/, "").replace(/^(todo|action item)\s*[:\-]\s*/i, "");
    task = cleanTask(task);
    if (task) items.push({ task, owner, deadline, priority });
  }
  return items;
}

// ---- invoke ----------------------------------------------------------------
async function handleInvoke(id, params) {
  const tool = params.tool;
  const args = params.arguments || {};
  const invokeId = params.invoke_id;
  if (tool !== "extract_actions") return sendError(id, -32601, `Unknown tool: ${tool}`);

  const notes = String(args.notes || "").trim();
  const context = String(args.context || "").trim();
  if (!notes) {
    return sendResult(id, { success: false, error: "No notes provided. Paste some text first.", tool });
  }

  let items, source = "llm";
  try {
    if (process.env.ACTION_TRIAGE_NO_SAMPLE) throw new Error("sampling disabled (offline mode)");
    const content = await hostSample(EXTRACTION_PROMPT(notes, context), 1200, invokeId);
    items = parseJsonItems(content);
    if (!items.length) throw new Error("LLM returned no items");
  } catch (e) {
    log("sampling failed, heuristic fallback:", e.message);
    items = heuristicExtract(notes);
    source = "heuristic";
  }
  sendResult(id, { success: true, data: { items, source, count: items.length }, tool });
}

// ---- main loop -------------------------------------------------------------
const rl = readline.createInterface({ input: process.stdin });
log("action-triage (node) up");
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let req;
  try { req = JSON.parse(line); } catch { return log("dropped non-JSON line"); }

  // Is this a reply to one of our reverse-RPC calls?
  if (req.id !== undefined && pending.has(req.id) && (req.result !== undefined || req.error !== undefined)) {
    const { resolve, reject } = pending.get(req.id);
    pending.delete(req.id);
    if (req.error) reject(new Error(req.error.message || "sampling error"));
    else resolve(extractText(req.result));
    return;
  }

  const { id, method, params = {} } = req;
  if (method === "describe") sendResult(id, MANIFEST);
  else if (method === "initialize") sendResult(id, { protocolVersion: "2.0", client_capabilities: { sampling: {} } });
  else if (method === "invoke") handleInvoke(id, params);
  else if (method === "health") sendResult(id, { status: "healthy", tools_count: 1 });
  else sendError(id, -32601, "Method not found");
});
rl.on("close", () => process.exit(0));
