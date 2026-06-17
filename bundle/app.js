// Action Board — Anna App UI bundle
// Wires the App UI SDK: tools.invoke (AI extraction), storage (persist board),
// chat (push summary back), window (title). Human-in-the-loop review lives here.

import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";
import { localExtract } from "./parser.js";
import {
  groupByStatus, buildSummaryMarkdown, mergeItems, normalizeItem,
  applyView, ownersOf, buildCSV, STATUSES,
} from "./board.js";
import { t, LANGS } from "./i18n.js";

// Server-minted ID is rewritten on publish. tool-dev-* works in `anna-app dev`.
const TOOL_ID = "tool-dev-action-triage";
const STORE_KEY = "board.items";
const LANG_KEY = "ui.lang";
const THEME_KEY = "ui.theme";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PRIO_KEY = { high: "prioHigh", medium: "prioMedium", low: "prioLow" };

let anna = null;
let items = []; // [{ id, task, owner, deadline, priority, status, approved, source }]
let view = { owner: "", sort: "none" }; // filter + sort state
let lang = "en";
let theme = "dark";
const tr = (key, vars) => t(lang, key, vars); // shorthand

// ---- id helper (browser runtime; Date/Math allowed here) -------------------
function uid() {
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function setStatus(text, kind = "") {
  const el = $("#status");
  el.textContent = text;
  el.className = "sub " + kind;
}

// ---- i18n ------------------------------------------------------------------
function applyI18n() {
  $$("[data-i18n]").forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach((el) => { el.placeholder = tr(el.dataset.i18nPh); });
  const lb = $("#langBtn");
  if (lb) lb.textContent = lang.toUpperCase();
  render(); // owner-filter "Everyone", priority labels, badges depend on lang
}

async function setLang(next) {
  lang = LANGS.includes(next) ? next : "en";
  applyI18n();
  try { await anna.storage.set({ key: LANG_KEY, value: lang }); } catch (_) {}
}

// ---- theme -----------------------------------------------------------------
function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  const b = $("#themeBtn");
  if (b) { b.textContent = theme === "light" ? "☀" : "☾"; b.title = tr("toggleTheme"); }
}

async function setTheme(next) {
  theme = next === "light" ? "light" : "dark";
  applyTheme();
  try { await anna.storage.set({ key: THEME_KEY, value: theme }); } catch (_) {}
}

// ---- persistence -----------------------------------------------------------
async function save() {
  try {
    await anna.storage.set({ key: STORE_KEY, value: items });
  } catch (e) {
    console.warn("storage.set failed", e);
  }
}

async function load() {
  try {
    const res = await anna.storage.get({ key: STORE_KEY });
    // Some runtimes return {value, exists}; others just {value}. Accept either,
    // and normalize each record so corrupted/partial storage can't break render.
    if (res && Array.isArray(res.value)) items = res.value.map((v) => normalizeItem(v, uid));
  } catch (e) {
    console.warn("storage.get failed", e);
  }
}

// ---- AI extraction ---------------------------------------------------------
async function extract() {
  const notes = $("#notes").value.trim();
  if (!notes) {
    flashHint(tr("pasteFirst"));
    return;
  }
  const btn = $("#extractBtn");
  btn.disabled = true;
  btn.textContent = tr("extracting");
  flashHint("");

  try {
    const { found, source } = await getItems(notes);
    // Merge: dedupe by task text so re-extracting is safe. Tag each item's source.
    const { items: merged, added, dupes } = mergeItems(items, found, uid, source);
    items = merged;
    if (!added) {
      flashHint(found.length ? tr("alreadyOnBoard") : tr("noneDetected"));
    } else {
      const dup = dupes ? tr("dupSuffix", { d: dupes, s: dupes > 1 ? "s" : "" }) : "";
      flashHint(tr("added", { n: added, s: added > 1 ? "s" : "", src: source, dup }));
      $("#notes").value = "";
      await save();
      render();
    }
  } catch (e) {
    console.error(e);
    flashHint(tr("extractFail", { e: e.message || e }));
  } finally {
    btn.disabled = false;
    btn.textContent = tr("extract");
  }
}

// Layered extraction:
//   1) the action-triage Executa tool (production AI path — LLM via host sampling)
//   2) if tools.invoke is unavailable in this runtime, an in-browser parser
//      so the demo always produces a board.
async function getItems(notes) {
  try {
    const out = await anna.tools.invoke({ tool_id: TOOL_ID, method: "extract_actions", args: { notes } });
    if (out && out.error) throw new Error(out.error.code || "tool error");
    const data = (out && out.data) || out;
    const found = (data && data.items) || [];
    if (found.length) {
      return { found, source: data.source === "heuristic" ? "parser" : "AI" };
    }
    throw new Error("tool returned no items");
  } catch (e) {
    console.warn("tools.invoke unavailable → in-browser parser:", e && e.message);
    return { found: localExtract(notes), source: "parser" };
  }
}

let hintTimer = null;
function flashHint(msg) {
  const el = $("#extractHint");
  el.textContent = msg;
  if (hintTimer) clearTimeout(hintTimer);
  if (msg) hintTimer = setTimeout(() => (el.textContent = ""), 6000);
}

// ---- rendering -------------------------------------------------------------
function render() {
  syncOwnerFilter();
  const visible = applyView(items, view);
  $$(".dropzone").forEach((z) => (z.innerHTML = ""));
  const { counts } = groupByStatus(visible);

  for (const it of visible) {
    const status = STATUSES.includes(it.status) ? it.status : "todo";
    const zone = $(`.dropzone[data-status="${status}"]`);
    if (zone) zone.appendChild(buildCard(it));
  }

  for (const s of STATUSES) {
    const c = $(`.count[data-count="${s}"]`);
    if (c) c.textContent = counts[s];
  }

  $("#empty").style.display = items.length ? "none" : "block";
  updateTitle(groupByStatus(items).counts); // window title reflects the whole board
}

// Keep the owner <select> in sync with the owners currently on the board.
function syncOwnerFilter() {
  const sel = $("#ownerFilter");
  if (!sel) return;
  const owners = ownersOf(items);
  const current = view.owner;
  // Build options via the DOM (textContent) — never string-interpolate owner
  // names into HTML. Owners can originate from the LLM and must not be able to
  // inject markup into the filter.
  sel.replaceChildren();
  const mk = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  sel.appendChild(mk("", tr("everyone")));
  for (const o of owners) sel.appendChild(mk(o, o));
  // keep selection if that owner still exists, else reset to all
  sel.value = owners.includes(current) ? current : "";
  if (sel.value !== current) view.owner = sel.value;
}

// Move a card to a new status (shared by drag-drop and keyboard).
function moveItem(id, status) {
  const it = items.find((x) => x.id === id);
  if (!it || !STATUSES.includes(status)) return;
  it.status = status;
  if (status === "done") it.approved = true;
  save();
  render();
}

function updateTitle(counts) {
  // Host API expects an object ({ title }), and the call is async — swallow both
  // sync throws and promise rejections so a title hiccup never breaks the board.
  try {
    const r = anna.window.set_title({ title: `Action Board · ${counts.open} open · ${counts.done} done` });
    if (r && typeof r.catch === "function") r.catch(() => {});
  } catch (_) {}
}

function buildCard(it) {
  const node = $("#cardTpl").content.firstElementChild.cloneNode(true);
  node.dataset.id = it.id;
  if (it.approved) node.classList.add("approved");

  node.setAttribute("aria-label", `${it.priority} priority: ${it.task}`);

  const prio = $(".prio", node);
  prio.dataset.prio = it.priority;
  prio.textContent = tr(PRIO_KEY[it.priority]);

  const src = $(".src", node);
  if (src && it.source) {
    src.textContent = it.source;
    src.dataset.src = it.source;
    src.hidden = false;
    src.title = it.source === "AI" ? "Extracted by the AI model" : "Extracted by the rule-based parser";
  }

  const taskEl = $('[data-field="task"]', node);
  taskEl.textContent = it.task;
  taskEl.setAttribute("role", "textbox");
  taskEl.setAttribute("aria-label", "Task");
  $('[data-field="owner"]', node).textContent = it.owner || "";
  $('[data-field="deadline"]', node).textContent = it.deadline || "";
  const psel = $('[data-field="priority"]', node);
  [...psel.options].forEach((o) => { o.textContent = tr(PRIO_KEY[o.value]); });
  psel.value = it.priority;

  // inline edits (contenteditable fields only — the priority <select> is
  // handled by its own change listener below; skip it here to avoid writing
  // the select's concatenated option text).
  node.addEventListener("input", (e) => {
    const f = e.target.dataset.field;
    if (!f || e.target.tagName === "SELECT") return;
    it[f] = e.target.textContent.trim();
    save();
  });
  psel.addEventListener("change", (e) => {
    it.priority = e.target.value;
    prio.dataset.prio = it.priority;
    prio.textContent = tr(PRIO_KEY[it.priority]);
    save();
  });

  // approve / delete
  $(".approve", node).addEventListener("click", () => {
    it.approved = !it.approved;
    node.classList.toggle("approved", it.approved);
    save();
  });
  $(".del", node).addEventListener("click", () => {
    items = items.filter((x) => x.id !== it.id);
    save();
    render();
  });

  // drag
  node.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", it.id);
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => node.classList.remove("dragging"));

  // keyboard (only when the card itself is focused, not an inner editable field)
  node.addEventListener("keydown", (e) => {
    if (e.target !== node) return;
    const i = STATUSES.indexOf(it.status === "doing" ? "doing" : it.status);
    if (e.key === "ArrowRight") { e.preventDefault(); moveItem(it.id, STATUSES[Math.min(i + 1, 2)]); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); moveItem(it.id, STATUSES[Math.max(i - 1, 0)]); }
    else if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      it.approved = !it.approved; node.classList.toggle("approved", it.approved); save();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      items = items.filter((x) => x.id !== it.id); save(); render();
    }
  });

  return node;
}

function wireDropzones() {
  $$(".dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      moveItem(e.dataTransfer.getData("text/plain"), zone.dataset.status);
    });
  });
}

// ---- push summary back into the conversation -------------------------------
async function sendSummary() {
  if (!items.length) {
    flashHint(tr("nothingToSummarize"));
    return;
  }
  const md = buildSummaryMarkdown(items);

  try {
    // Structured artifact (durable) + a readable message.
    await anna.chat.append_artifact({
      artifact: {
        kind: "action_board",
        app_slug: "action-board",
        summary: `${items.length} action items`,
        data: { items },
      },
    });
    if (anna.chat.write_message) {
      await anna.chat.write_message({ role: "assistant", content: md });
    }
    flashHint(tr("summarySent"));
  } catch (e) {
    console.error(e);
    flashHint(tr("summaryFail", { e: e.message || e }));
  }
}

// ---- clear + export --------------------------------------------------------
async function clearBoard() {
  if (!items.length) return;
  if (typeof confirm === "function" && !confirm(tr("confirmClear"))) return;
  items = [];
  view.owner = "";
  await save();
  render();
  flashHint(tr("boardCleared"));
}

// Manually add a single task (runs it through the parser to pick up @owner /
// dates / priority), tagged with source "manual".
async function addManual(text) {
  const line = (text || "").trim();
  if (!line) return;
  const parsed = localExtract(line);
  const found = parsed.length ? parsed : [{ task: line, priority: "medium" }];
  const { items: merged, added } = mergeItems(items, found, uid, "manual");
  items = merged;
  if (!added) { flashHint(tr("alreadyOnBoard")); return; }
  await save();
  render();
}

// Download a file from the iframe. May be restricted by the sandbox; if so,
// fall back to copying the content to the clipboard.
async function download(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flashHint(tr("exported", { f: filename }));
  } catch (e) {
    try {
      await navigator.clipboard.writeText(text);
      flashHint(tr("exportClip", { f: filename }));
    } catch (_) {
      flashHint(tr("exportFail"));
    }
  }
}

// ---- boot ------------------------------------------------------------------
async function boot() {
  anna = await AnnaAppRuntime.connect();

  await load();
  // restore saved language + theme
  try {
    const r = await anna.storage.get({ key: LANG_KEY });
    if (r && LANGS.includes(r.value)) lang = r.value;
  } catch (_) {}
  try {
    const r = await anna.storage.get({ key: THEME_KEY });
    if (r && (r.value === "light" || r.value === "dark")) theme = r.value;
  } catch (_) {}

  wireDropzones();
  applyTheme();
  applyI18n();             // sets all static text + calls render()
  setStatus(tr("ready"), "ok");

  $("#extractBtn").addEventListener("click", extract);
  $("#summaryBtn").addEventListener("click", sendSummary);
  $("#clearBtn").addEventListener("click", clearBoard);
  $("#exportMdBtn").addEventListener("click", () => {
    if (!items.length) return flashHint(tr("nothingToExport"));
    download("action-board.md", buildSummaryMarkdown(items), "text/markdown");
  });
  $("#exportCsvBtn").addEventListener("click", () => {
    if (!items.length) return flashHint(tr("nothingToExport"));
    download("action-board.csv", buildCSV(items), "text/csv");
  });

  // language + theme toggles
  $("#langBtn").addEventListener("click", () => setLang(lang === "en" ? "id" : "en"));
  $("#themeBtn").addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"));

  // quick-add manual task
  $("#quickAdd").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#quickAddInput");
    addManual(input.value);
    input.value = "";
  });

  // owner filter
  $("#ownerFilter").addEventListener("change", (e) => { view.owner = e.target.value; render(); });

  // priority sort toggle
  $("#sortBtn").addEventListener("click", (e) => {
    view.sort = view.sort === "priority" ? "none" : "priority";
    const on = view.sort === "priority";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.classList.toggle("active", on);
    render();
  });

  // Ctrl/Cmd+Enter in the notes box runs extraction.
  $("#notes").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); extract(); }
  });

  // If the LLM opened this view with notes, prefill and auto-extract.
  const payload = anna.entryPayload;
  if (payload && payload.notes) {
    $("#notes").value = payload.notes;
    extract();
  }
  anna.on("entry_payload", (p) => {
    if (p && p.notes) {
      $("#notes").value = p.notes;
      extract();
    }
  });
  // Another device updated the board.
  anna.on("runtime_state_synced", async () => {
    await load();
    render();
  });
}

boot().catch((e) => {
  console.error(e);
  setStatus(tr("connectFail"), "err");
});
