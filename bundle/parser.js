// Shared, dependency-free action-item parser for the Action Board UI.
// Mirrors the heuristic in the action-triage Executa tool, but lives in its own
// ESM module so it can be unit-tested in Node and reused by app.js without
// dragging in the Anna SDK. Pure functions only — no DOM, no globals.

export const VERBS = [
  "send", "email", "call", "write", "draft", "review", "fix", "ship", "build",
  "create", "update", "schedule", "book", "prepare", "follow", "finish",
  "deploy", "test", "investigate", "research", "design", "deliver", "share",
  "set up", "setup", "add", "remove", "check", "finalize", "rotate", "migrate",
  "wire", "plan", "coordinate", "approve", "merge", "refactor", "document",
  "organize", "audit", "upgrade",
];
export const HIGH = ["urgent", "asap", "critical", "blocker", "today", "p0", "p1", "!!"];
export const LOW = ["someday", "nice to have", "low priority", "eventually", "backlog"];
// Social / non-action chatter — skip even if a verb happens to appear.
export const CHATTER = ["lol", "haha", "thanks", "thank you", "great job", "good job", "nice work", "kudos", "shoutout"];
export const DATE = /\b(\d{4}-\d{2}-\d{2}|today|tomorrow|tonight|eod|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|next week|this week|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b(\s+\d{1,2})?/i;

export function cleanTask(t) {
  t = String(t)
    .replace(/^@[A-Za-z][\w-]*\s+(?:to|will|should|needs to|is going to)\s+/i, "")
    .replace(/^@[A-Za-z][\w-]*[:\s]+/, "")
    .replace(/^[A-Z][a-z]+\s+(?:to|will|should|needs to|is going to)\s+/, "")
    .replace(/[\s,;\-]+(urgent|asap|critical|p0|p1|!!)\.?$/i, "")
    .trim()
    .replace(/\.$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function localExtract(notes) {
  const items = [];
  for (const raw of String(notes == null ? "" : notes).split(/\r?\n/)) {
    const line = raw.replace(/^[-*•–\s\t]+/, "").trim();
    if (line.length < 4) continue;
    const low = line.toLowerCase();
    if (CHATTER.some((c) => low.startsWith(c))) continue;
    const isAction =
      VERBS.some((v) => low.startsWith(v) || (" " + low + " ").includes(" " + v + " ")) ||
      low.includes("todo") ||
      low.includes("action item") ||
      low.startsWith("[ ]") ||
      low.includes("follow up");
    if (!isAction) continue;

    let owner = "";
    const at = line.match(/@([A-Za-z][\w-]*)/);
    if (at) owner = at[1];
    else {
      const as = line.match(/\b([A-Z][a-z]+)\s+(?:to|will|should|needs to|is going to)\b/);
      if (as) owner = as[1];
    }

    const md = line.match(DATE);
    const deadline = md ? md[0].trim() : "";

    let priority = "medium";
    if (HIGH.some((k) => low.includes(k))) priority = "high";
    else if (LOW.some((k) => low.includes(k))) priority = "low";

    const task = cleanTask(line.replace(/^\[\s?\]\s*/, "").replace(/^(todo|action item)\s*[:\-]\s*/i, ""));
    if (task) items.push({ task, owner, deadline, priority });
  }
  return items;
}

// Normalize an item key for de-duplication (case/space-insensitive task text).
export function itemKey(it) {
  return String((it && it.task) || "").toLowerCase().replace(/\s+/g, " ").trim();
}
