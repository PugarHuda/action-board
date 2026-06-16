// Action Board — Anna App UI bundle
// Wires the App UI SDK: tools.invoke (AI extraction), storage (persist board),
// chat (push summary back), window (title). Human-in-the-loop review lives here.

import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";
import { localExtract } from "./parser.js";
import { groupByStatus, buildSummaryMarkdown, mergeItems, normalizeItem, STATUSES } from "./board.js";

// Server-minted ID is rewritten on publish. tool-dev-* works in `anna-app dev`.
const TOOL_ID = "tool-dev-action-triage";
const STORE_KEY = "board.items";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let anna = null;
let items = []; // [{ id, task, owner, deadline, priority, status, approved }]

// ---- id helper (browser runtime; Date/Math allowed here) -------------------
function uid() {
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function setStatus(text, kind = "") {
  const el = $("#status");
  el.textContent = text;
  el.className = "sub " + kind;
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
    flashHint("Paste some notes first.");
    return;
  }
  const btn = $("#extractBtn");
  btn.disabled = true;
  btn.textContent = "✦ Extracting…";
  flashHint("");

  try {
    const { found, source } = await getItems(notes);
    // Merge: dedupe by task text so re-extracting is safe.
    const { items: merged, added, dupes } = mergeItems(items, found, uid);
    items = merged;
    if (!added) {
      flashHint(found.length ? "Those items are already on the board." : "No action items detected. Try clearer notes.");
    } else {
      flashHint(`Added ${added} item${added > 1 ? "s" : ""} (${source})${dupes ? `, skipped ${dupes} duplicate${dupes > 1 ? "s" : ""}` : ""}. Review & approve →`);
      $("#notes").value = "";
      await save();
      render();
    }
  } catch (e) {
    console.error(e);
    flashHint("Extraction failed: " + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Extract action items";
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
      return { found, source: data.source === "heuristic" ? "tool · offline parser" : "AI" };
    }
    throw new Error("tool returned no items");
  } catch (e) {
    console.warn("tools.invoke unavailable → in-browser parser:", e && e.message);
    return { found: localExtract(notes), source: "in-browser parser" };
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
  $$(".dropzone").forEach((z) => (z.innerHTML = ""));
  const { counts } = groupByStatus(items);

  for (const it of items) {
    const status = STATUSES.includes(it.status) ? it.status : "todo";
    const zone = $(`.dropzone[data-status="${status}"]`);
    if (zone) zone.appendChild(buildCard(it));
  }

  for (const s of STATUSES) {
    const c = $(`.count[data-count="${s}"]`);
    if (c) c.textContent = counts[s];
  }

  $("#empty").style.display = items.length ? "none" : "block";
  updateTitle(counts);
}

function updateTitle(counts) {
  try {
    anna.window.set_title(`Action Board · ${counts.open} open · ${counts.done} done`);
  } catch (_) {}
}

function buildCard(it) {
  const node = $("#cardTpl").content.firstElementChild.cloneNode(true);
  node.dataset.id = it.id;
  if (it.approved) node.classList.add("approved");

  const prio = $(".prio", node);
  prio.dataset.prio = it.priority;
  prio.textContent = it.priority;

  $('[data-field="task"]', node).textContent = it.task;
  $('[data-field="owner"]', node).textContent = it.owner || "";
  $('[data-field="deadline"]', node).textContent = it.deadline || "";
  $('[data-field="priority"]', node).value = it.priority;

  // inline edits (contenteditable fields only — the priority <select> is
  // handled by its own change listener below; skip it here to avoid writing
  // the select's concatenated option text).
  node.addEventListener("input", (e) => {
    const f = e.target.dataset.field;
    if (!f || e.target.tagName === "SELECT") return;
    it[f] = e.target.textContent.trim();
    save();
  });
  $('[data-field="priority"]', node).addEventListener("change", (e) => {
    it.priority = e.target.value;
    prio.dataset.prio = it.priority;
    prio.textContent = it.priority;
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
      const id = e.dataTransfer.getData("text/plain");
      const it = items.find((x) => x.id === id);
      if (it) {
        it.status = zone.dataset.status;
        if (it.status === "done") it.approved = true;
        save();
        render();
      }
    });
  });
}

// ---- push summary back into the conversation -------------------------------
async function sendSummary() {
  if (!items.length) {
    flashHint("Nothing to summarize yet.");
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
    flashHint("Summary sent to chat ✓");
  } catch (e) {
    console.error(e);
    flashHint("Could not post to chat: " + (e.message || e));
  }
}

// ---- boot ------------------------------------------------------------------
async function boot() {
  anna = await AnnaAppRuntime.connect();
  setStatus("Ready — paste notes to begin", "ok");

  await load();
  wireDropzones();
  render();

  $("#extractBtn").addEventListener("click", extract);
  $("#summaryBtn").addEventListener("click", sendSummary);

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
  setStatus("Failed to connect to Anna runtime", "err");
});
