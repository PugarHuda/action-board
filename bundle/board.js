// Pure board logic for Action Board — no DOM, no SDK, no globals.
// Extracted from app.js so the chat-summary builder, status grouping, and
// dedupe-merge can be unit-tested in plain Node. app.js imports these.

import { itemKey } from "./parser.js";

export const STATUSES = ["todo", "doing", "done"];
const PRIORITIES = ["high", "medium", "low"];

// Coerce a raw/extracted/persisted record into a well-formed board item.
export function normalizeItem(raw, makeId) {
  const r = raw || {};
  return {
    id: r.id || (makeId ? makeId() : ""),
    task: typeof r.task === "string" ? r.task : "",
    owner: typeof r.owner === "string" ? r.owner : "",
    deadline: typeof r.deadline === "string" ? r.deadline : "",
    priority: PRIORITIES.includes(r.priority) ? r.priority : "medium",
    status: STATUSES.includes(r.status) ? r.status : "todo",
    approved: !!r.approved,
  };
}

// Split items into columns and compute counts (+ derived `open`).
export function groupByStatus(items) {
  const groups = { todo: [], doing: [], done: [] };
  for (const it of items || []) {
    const s = STATUSES.includes(it && it.status) ? it.status : "todo";
    groups[s].push(it);
  }
  const counts = { todo: groups.todo.length, doing: groups.doing.length, done: groups.done.length };
  counts.open = counts.todo + counts.doing;
  return { ...groups, counts };
}

// Append freshly-extracted items to the board, skipping duplicates (by task
// text) and empties. New items land in "todo", unapproved. Returns the new
// array plus how many were added / skipped as duplicates.
export function mergeItems(existing, found, makeId) {
  const base = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(base.map(itemKey));
  let added = 0, dupes = 0;
  for (const raw of found || []) {
    const it = normalizeItem({ ...raw, status: "todo", approved: false }, makeId);
    if (!it.task) continue;
    const k = itemKey(it);
    if (seen.has(k)) { dupes++; continue; }
    seen.add(k);
    base.push(it);
    added++;
  }
  return { items: base, added, dupes };
}

// Build the markdown summary posted back into the conversation.
export function buildSummaryMarkdown(items) {
  const g = groupByStatus(items);
  const line = (it) =>
    `• ${it.task}` +
    (it.owner ? ` — @${it.owner}` : "") +
    (it.deadline ? ` (${it.deadline})` : "") +
    ` [${it.priority}]`;
  let md = "**Action Board summary**\n";
  if (g.todo.length) md += `\n_To Do_\n${g.todo.map(line).join("\n")}\n`;
  if (g.doing.length) md += `\n_In Progress_\n${g.doing.map(line).join("\n")}\n`;
  if (g.done.length) md += `\n_Done_\n${g.done.map(line).join("\n")}\n`;
  return md;
}
