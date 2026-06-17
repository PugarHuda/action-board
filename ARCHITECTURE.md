# Architecture

How Action Board fits together, and why it's split the way it is.

## Data flow

```
                          Anna conversation
                                 │  #mention / open_app_view(payload={notes})
                                 ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  App UI window  (sandboxed iframe SPA, App UI SDK over postMsg)│
   │                                                                │
   │  bundle/index.html ── app.js ──┬── parser.js  (in-browser      │
   │                                │              extraction fallbk)│
   │                                └── board.js   (grouping, merge, │
   │                                               summary, CSV)     │
   │     │ tools.invoke         │ storage.*        │ chat.*          │
   └─────┼──────────────────────┼──────────────────┼────────────────┘
         ▼                      ▼                  ▼
   ┌───────────────┐     ┌─────────────┐    ┌──────────────┐
   │ Executa tool  │     │ APS storage │    │ conversation │
   │ action-triage │     │ (board.items)│   │  (artifact + │
   │ (stdio JSON-  │     └─────────────┘    │   message)   │
   │  RPC plugin)  │                        └──────────────┘
   │      │ sampling/createMessage (reverse-RPC)
   │      ▼
   │  host LLM (no API key)
   └───────────────┘
```

## Components

### UI bundle (`bundle/`)
A static SPA — no bundler. The host serves it in a sandboxed iframe (`<iframe sandbox>`
without `allow-same-origin`); all host access goes through the App UI SDK over
`postMessage`.

- **`app.js`** — the only SDK-coupled file. Wires `tools.invoke`, `storage.*`,
  `chat.*`, `window.set_title`; owns DOM rendering, drag-and-drop, keyboard handling,
  and the toolbar.
- **`parser.js`** — pure, dependency-free. Heuristic note→items extraction used as the
  in-browser fallback. No DOM, no SDK → unit-testable.
- **`board.js`** — pure board logic: `groupByStatus`, `mergeItems` (dedupe),
  `normalizeItem`, `applyView` (filter+sort), `buildSummaryMarkdown`, `buildCSV`. No
  DOM, no SDK → unit-testable.
- **`preview.html`** — a static, SDK-free render of the UI (parameterized by query
  string) used to generate the screenshots/GIF.

**Why the split:** `app.js` can't run outside a browser+SDK, so all the logic worth
testing lives in `parser.js`/`board.js` as pure functions. `app.js` becomes thin glue.

### Executa tool (`executas/triage-*`)
A standalone JSON-RPC-over-stdio process (Node default, Python parity). Implements
`describe` / `invoke`. On `extract_actions` it borrows the host LLM via reverse-RPC
`sampling/createMessage` (content sent as `{type:"text",text}`, reply read from
`result.content.text`). No API keys — the host injects sampling.

### Three-layer extraction (resilience)

| Layer | Lives in | Runs when |
|---|---|---|
| Host LLM (sampling) | the tool | production / real platform |
| Tool heuristic | the tool | `tools.invoke` works but sampling unavailable |
| In-browser parser | `app.js` + `parser.js` | a runtime that lacks `tools.invoke` (resilience fallback) |

A board always appears; the UI labels which layer produced each card.

## State model

- Board = `[{ id, task, owner, deadline, priority, status, approved, source }]`.
- Persisted under APS key `board.items` (per-app/user). `load()` normalizes every
  record so corrupt/partial storage can't break render.
- Server-authoritative: reopening the window on another device restores the board.

## Manifest / ACL notes

- `schema: 2`; `host_capabilities: ["llm.sample"]`.
- `ui.host_api` grants: `storage`, `tools` (tool-id patterns like `required:*` —
  **not** method names), `chat`.
- Tool id is **mint-only**; `tool-dev-action-triage` is the local-dev placeholder.

## Testing topology

- **parser / board** — pure unit tests (plain Node).
- **contract** — spawns the real plugin over stdio, drives JSON-RPC.
- **sampling** — a mock "host" answers the plugin's reverse-RPC to exercise the LLM
  path and all fallbacks (the only way to test sampling offline).
- **e2e** — drives a running `anna-app dev` harness's session API (storage/chat/
  window/tools) the same way the iframe SDK does.

See [README](README.md#tests--qa) for the suite breakdown.
