# Action Board — Anna AI-Native App

**Paste messy meeting notes → get a structured action board you actually trust.**

Action Board turns a raw brain-dump or meeting transcript into editable action-item
cards (**task · owner · deadline · priority**) that you approve and drag across
**To Do / In Progress / Done**. The AI does the first pass; the human stays the
reviewer. The board persists automatically, and one click pushes a clean summary
back into the conversation.

This is the hackathon answer to *"what comes after a chatbot?"* — the assistant
**participates inside a workflow** (extracting structure, updating the board) while
the human keeps final say. It uses four Anna primitives together:
**App UI window · Executa tool call · persistent storage (APS) · chat write-back.**

---

## How AI is used (and why it's "meaningful", not a tempel-an)

1. You paste notes and hit **Extract**.
2. The UI calls the `action-triage` **Executa tool** via `tools.invoke`.
3. Inside the tool, it **borrows the host LLM** through reverse sampling
   (`sampling/createMessage`) — **no API key required** — to extract a clean,
   structured JSON list of action items.
4. Cards render in the UI. You **edit, approve, delete, and drag** them — human review.
5. State is saved to **APS** (`storage.set`) and survives reloads / other devices.
6. **Send summary to chat** posts a structured artifact + readable message back into
   the conversation (`chat.append_artifact` / `chat.write_message`).

The LLM in the conversation can also open the app directly:
`open_app_view(view="board", payload={ notes: "<raw text>" })` → the board
auto-extracts. (See `system_prompt_addendum` in `manifest.json`.)

### Resilience (so the demo never dies)

Extraction degrades gracefully across three layers — you always get a board:

| Layer | Where | When it runs |
|-------|-------|--------------|
| **Host LLM (sampling)** | inside the Executa tool | production / real platform |
| **Tool heuristic parser** | inside the Executa tool | `tools.invoke` works but no LLM (`ACTION_TRIAGE_NO_SAMPLE=1`) |
| **In-browser parser** | `bundle/app.js` | runtime hasn't implemented `tools.invoke` (e.g. the current local MVP harness) |

The UI label shows which path produced the items.

---

## Project structure

```
action-board/
├── app.json                 # App Store listing metadata
├── manifest.json            # schema 2: executas + ui (views, host_api ACL) + dev config
├── bundle/                  # static SPA (no bundler needed)
│   ├── index.html
│   ├── app.js               # SDK wiring: tools / storage / chat / window + DnD + review
│   ├── parser.js            # shared, dependency-free action-item parser (unit-tested)
│   ├── board.js             # pure board logic: grouping, summary, dedupe-merge (unit-tested)
│   ├── style.css
│   └── icon.svg
├── executas/
│   ├── triage-node/         # Tool (DEFAULT for `anna-app dev`) — verified working
│   │   ├── plugin.js
│   │   └── package.json
│   └── triage-python/       # Same contract, Python flavour (publish-ready)
│       ├── plugin.py
│       └── pyproject.toml
├── tests/                   # 5 suites, 115 assertions, plain Node (no deps)
│   ├── run-all.mjs          # aggregate runner (npm test)
│   ├── parser.test.mjs
│   ├── board.test.mjs       # pure board logic
│   ├── replay.mjs           # stdio contract
│   ├── mock-host.test.mjs   # LLM / sampling path
│   └── e2e-harness.test.mjs # live harness lifecycle
├── fixtures/
│   └── sample-notes.txt     # demo input
└── README.md
```

---

## Run it

### Prereqs
- **Node 22+**
- **uv** (the harness spawns a Python bridge via `uvx`, even for a Node executa):
  - Windows: `irm https://astral.sh/uv/install.ps1 | iex`
  - macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Anna CLI**: `npm i -g @anna-ai/cli`, then `anna-app doctor`

### Local dev (Anna harness)
```bash
cd action-board
anna-app dev --no-llm        # serves bundle/ + supervises executas/triage-node as a stdio tool
# open http://localhost:5180/  → the board view loads in a sandboxed iframe
```
First run downloads the Python bridge (~20 MB, cached afterwards). Use the Python
flavour instead with:
```bash
anna-app dev --executa dir=./executas/triage-python,type=python
```

### Validate before publishing
```bash
anna-app validate --strict   # ✓ passes (schema + UI ACL + bundle linter)
```

## Verified on this machine (Anna CLI 0.1.30, app-schema 0.10.0)

- ✅ `anna-app validate --strict` → **passes**
- ✅ `anna-app dev` → bridge ready, dashboard at `http://localhost:5180/`, bundle served
- ✅ Host APIs exercised through the harness: `storage.set/get/list/delete`, `chat.append_artifact`,
  `chat.write_message`, `window.set_title`, `tools.list` (lists `action-triage`)
- ✅ **AI/sampling path** verified through the real executa runtime:
  `anna-app executa dev --invoke extract_actions --mock-sampling fixtures/mock-sampling.jsonl`
  returns `"source":"llm"` with model-parsed items (and `--no-sampling` → `"heuristic"`)
- ✅ `npm test` → **115/115 assertions** across 5 suites
- ⚠️ `tools.invoke` returns `not_implemented` in this MVP harness version → the UI uses
  its in-browser parser locally (see Resilience above). On the real platform `tools.invoke`
  routes to the Executa tool's AI path (verified via `executa dev` above).

## Guides in this repo

- **[DEMO.md](DEMO.md)** — 60–90s demo script, shot list, narration, submission blurb
- **[PUBLISH.md](PUBLISH.md)** — mint Tool ID → wire it in → publish & submit (real `anna-app` commands)
- **CI** — `.github/workflows/ci.yml` runs validate + all tests + the mock-sampling AI check + live-harness E2E on every push

---

## Tests / QA

Five suites, **115 assertions, all green**. No test framework — plain Node, zero deps.

```bash
npm test            # runs all suites (E2E auto-skips if no harness is up)
npm run test:parser     # 41 — in-browser parser: edge cases, adversarial input, chatter filter
npm run test:board      # 29 — pure board logic: grouping, summary markdown, dedupe-merge, normalize
npm run test:contract   # 15 — Executa JSON-RPC stdio contract (describe/invoke/errors)
npm run test:sampling   # 18 — mock-host drives the tool's LLM/sampling path + fallbacks
npm run test:e2e        # 12 — live harness: storage/chat/window/tools.list lifecycle
```

What each suite proves:

| Suite | File | Covers |
|-------|------|--------|
| **parser** | `tests/parser.test.mjs` | owner/deadline/priority extraction, FYI/chatter skipping, prefix/suffix cleanup, CRLF, 2000-line perf, null/empty/HTML-ish input, dedupe keys |
| **board** | `tests/board.test.mjs` | status grouping + counts, item normalization (bad priority/status coerced), dedupe-merge (skips dups & empties, no input mutation), chat-summary markdown formatting |
| **contract** | `tests/replay.mjs` | spawns the real plugin over stdio; `describe` returns a bare manifest; `invoke` succeeds; unknown method → `-32601`; empty notes don't crash |
| **sampling** | `tests/mock-host.test.mjs` | acts as the Anna host and answers the plugin's `sampling/createMessage` reverse-RPC — real `{type:text}` shape + string/array shapes, ```json fences, garbage→heuristic, error→heuristic, malformed-item normalization, `invoke_id` echo |
| **e2e** | `tests/e2e-harness.test.mjs` | against a running `anna-app dev`: real `storage.set/get/list/delete`, `chat.append_artifact/write_message`, `window.set_title`, `tools.list` |

### Test the tool directly (no harness)
```bash
cd executas/triage-node
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"describe"}' \
  '{"jsonrpc":"2.0","id":2,"method":"invoke","params":{"tool":"extract_actions","invoke_id":"t","arguments":{"notes":"- @Sara to send the deck by Fri, urgent\n- Tom will fix the login bug tomorrow"}}}' \
  | ACTION_TRIAGE_NO_SAMPLE=1 node plugin.js
```
Expected: a `describe` manifest, then `{ success:true, data:{ items:[…], source:"heuristic" } }`.

---

## 60-second demo script

1. Open the **Action Board** window.
2. Paste `fixtures/sample-notes.txt`.
3. Hit **Extract** → cards appear (status updates / FYIs are skipped).
4. Fix one owner, bump one priority, **approve** two cards.
5. **Drag** a card to *In Progress*, another to *Done*.
6. Reload the window → board is still there (APS persistence).
7. Click **Send summary to chat** → a clean summary lands back in the conversation.

---

## Publishing (per Anna docs)

1. Mint a Tool ID at `https://anna.partners/executa`; rewrite `tool-dev-action-triage`
   in `manifest.json` and `TOOL_ID` in `bundle/app.js`.
2. Create the App listing from `app.json`.
3. Create a version with `manifest.json` + upload all `bundle/` files.
4. `anna-app validate --strict`, submit for review, publish.

> Tool IDs are **mint-only** — Anna assigns them server-side; you can't type a custom one.
