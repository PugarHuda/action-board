// Unit tests for the pure board logic (bundle/board.js).
// Run: node tests/board.test.mjs

import {
  normalizeItem, groupByStatus, mergeItems, buildSummaryMarkdown,
  sortByPriority, ownersOf, applyView, buildCSV, STATUSES,
} from "../bundle/board.js";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log("board logic tests\n");

// deterministic id generator for tests
let n = 0;
const mkId = () => "id" + (++n);

// --- normalizeItem ---
{
  const it = normalizeItem({ task: "Do X" }, mkId);
  ok("normalize fills defaults", it.owner === "" && it.deadline === "" && it.priority === "medium" && it.status === "todo" && it.approved === false);
  ok("normalize assigns id when missing", /^id\d+$/.test(it.id));
  ok("normalize keeps existing id", normalizeItem({ id: "keep", task: "x" }, mkId).id === "keep");
  ok("normalize coerces bad priority -> medium", normalizeItem({ task: "x", priority: "ZOMG" }).priority === "medium");
  ok("normalize coerces bad status -> todo", normalizeItem({ task: "x", status: "nope" }).status === "todo");
  ok("normalize keeps valid status", normalizeItem({ task: "x", status: "done" }).status === "done");
  ok("normalize non-string task -> ''", normalizeItem({ task: 123 }).task === "");
  ok("normalize coerces approved to boolean", normalizeItem({ task: "x", approved: "yes" }).approved === true);
}

// --- groupByStatus ---
{
  const items = [
    { task: "a", status: "todo" },
    { task: "b", status: "doing" },
    { task: "c", status: "done" },
    { task: "d", status: "todo" },
    { task: "e" }, // missing status -> todo
  ];
  const g = groupByStatus(items);
  ok("groups todo", g.todo.length === 3);
  ok("groups doing", g.doing.length === 1);
  ok("groups done", g.done.length === 1);
  ok("counts.open = todo + doing", g.counts.open === 4);
  ok("counts.done", g.counts.done === 1);
  ok("empty input -> zero counts", groupByStatus([]).counts.open === 0);
  ok("null input safe", groupByStatus(null).counts.open === 0);
}

// --- mergeItems ---
{
  const existing = [normalizeItem({ task: "Send the deck" }, mkId)];
  const found = [
    { task: "Send the deck" },          // dup (same text)
    { task: "  send   THE deck  " },     // dup (normalized key)
    { task: "Fix the bug" },             // new
    { task: "" },                        // empty -> ignored
    { owner: "nobody" },                 // no task -> ignored
  ];
  const r = mergeItems(existing, found, mkId);
  ok("merge adds only the new item", r.added === 1, `(added ${r.added})`);
  ok("merge counts duplicates", r.dupes === 2, `(dupes ${r.dupes})`);
  ok("merge ignores empties (not counted as dupes)", r.items.length === 2);
  ok("merged items are normalized (status todo, unapproved)",
    r.items.every((i) => i.status === "todo" || i.id === existing[0].id));
  ok("new items get ids", r.items.every((i) => i.id));
  ok("merge on empty existing", mergeItems([], [{ task: "X" }], mkId).added === 1);
  ok("merge returns a new array (no mutation of input)", !Object.is(mergeItems(existing, [], mkId).items, existing));
}

// --- buildSummaryMarkdown ---
{
  const items = [
    { task: "Send the deck", owner: "Sara", deadline: "Fri", priority: "high", status: "todo" },
    { task: "Fix the bug", owner: "", deadline: "", priority: "medium", status: "doing" },
    { task: "Ship it", owner: "Tom", deadline: "", priority: "low", status: "done" },
  ];
  const md = buildSummaryMarkdown(items);
  ok("summary has header", md.startsWith("**Action Board summary**"));
  ok("summary has all three sections", md.includes("_To Do_") && md.includes("_In Progress_") && md.includes("_Done_"));
  ok("summary formats owner + deadline + priority",
    md.includes("• Send the deck — @Sara (Fri) [high]"));
  ok("summary omits empty owner/deadline",
    md.includes("• Fix the bug [medium]") && !md.includes("@ ("));
  const onlyTodo = buildSummaryMarkdown([{ task: "x", priority: "medium", status: "todo" }]);
  ok("summary omits empty sections", onlyTodo.includes("_To Do_") && !onlyTodo.includes("_Done_"));
  ok("empty board -> header only", buildSummaryMarkdown([]).trim() === "**Action Board summary**");
}

// --- source tagging ---
{
  ok("normalize keeps source", normalizeItem({ task: "x", source: "AI" }).source === "AI");
  ok("normalize defaults source to ''", normalizeItem({ task: "x" }).source === "");
  const r = mergeItems([], [{ task: "a" }, { task: "b" }], mkId, "AI");
  ok("mergeItems tags new items with source", r.items.every((i) => i.source === "AI"));
}

// --- sortByPriority ---
{
  const sorted = sortByPriority([
    { task: "lo", priority: "low" },
    { task: "hi", priority: "high" },
    { task: "me", priority: "medium" },
  ]);
  ok("sorts high → medium → low", sorted.map((i) => i.task).join() === "hi,me,lo");
  ok("sortByPriority does not mutate input", (() => {
    const a = [{ priority: "low" }, { priority: "high" }];
    sortByPriority(a);
    return a[0].priority === "low";
  })());
  ok("unknown priority sorts as medium", sortByPriority([{ task: "x", priority: "?" }, { task: "h", priority: "high" }])[0].task === "h");
}

// --- ownersOf ---
{
  const owners = ownersOf([
    { owner: "Sara" }, { owner: "Tom" }, { owner: "Sara" }, { owner: "" }, {},
  ]);
  ok("unique, sorted, non-empty owners", owners.join() === "Sara,Tom");
  ok("ownersOf([]) -> []", ownersOf([]).length === 0);
}

// --- applyView (filter + sort) ---
{
  const data = [
    { task: "a", owner: "Sara", priority: "low", status: "todo" },
    { task: "b", owner: "Tom", priority: "high", status: "todo" },
    { task: "c", owner: "Sara", priority: "high", status: "doing" },
  ];
  ok("filter by owner", applyView(data, { owner: "Sara" }).length === 2);
  ok("no filter returns all", applyView(data, {}).length === 3);
  ok("sort=priority orders by priority",
    applyView(data, { sort: "priority" }).map((i) => i.task).join() === "b,c,a");
  ok("filter + sort compose",
    applyView(data, { owner: "Sara", sort: "priority" }).map((i) => i.task).join() === "c,a");
  ok("applyView null-safe", applyView(null, null).length === 0);
}

// --- buildCSV ---
{
  const csv = buildCSV([
    { task: "Send the deck", owner: "Sara", deadline: "Fri", priority: "high", status: "todo", approved: false },
    { task: 'Quote "X", now', owner: "", deadline: "", priority: "medium", status: "done", approved: true },
  ]);
  const lines = csv.split("\n");
  ok("CSV has header row", lines[0] === "task,owner,deadline,priority,status,approved");
  ok("CSV row count = items + header", lines.length === 3);
  ok("CSV escapes commas/quotes", lines[2].includes('"Quote ""X"", now"'));
  ok("CSV maps approved boolean to yes/no", lines[1].endsWith(",no") && lines[2].endsWith(",yes"));
  ok("buildCSV([]) -> header only", buildCSV([]).split("\n").length === 1);
}

// --- STATUSES export sanity ---
ok("STATUSES are the three columns", STATUSES.join(",") === "todo,doing,done");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
