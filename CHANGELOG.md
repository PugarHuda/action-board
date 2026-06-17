# Changelog

All notable changes to Action Board. Pre-release; dates are when work landed.

## [Unreleased]

### Added
- **Action Board app**: paste notes → AI-extracted action-item cards on a
  To Do / In Progress / Done board with human review (edit / approve / drag).
- **Executa tool `action-triage`** (Node default + Python parity): JSON-RPC stdio
  plugin; extracts via host **sampling** (`sampling/createMessage`, no API key) with a
  deterministic heuristic fallback.
- **App UI bundle**: sandboxed SPA via the App UI SDK — `tools.invoke`, `storage.*`,
  `chat.*`, `window.set_title`; drag-and-drop board; auto-extract from
  `open_app_view(payload={notes})`.
- **Persistence** to Anna Persistent Storage; **chat write-back**
  (`append_artifact` + `write_message`).
- **Three-layer extraction fallback** (host LLM → tool heuristic → in-browser parser)
  so a board always appears.
- **Features**: per-card source badge (AI / parser / manual), **quick-add** a task by
  hand, filter by owner, sort by priority, export to Markdown/CSV, clear board,
  re-extract dedupe.
- **Bilingual UI**: one-click **EN / ID** toggle (persisted via APS), all chrome +
  priority labels localized (`bundle/i18n.js`).
- **Dark / light theme** toggle (persisted via APS; CSS custom-property themes).
- **Contributor docs**: CONTRIBUTING.md, issue templates (bug / feature), PR template.
- **Smarter date detection**: weekday + ordinal (`Friday the 20th`), `Jun 20`,
  `in 3 days`, `end of week`, full month names, ISO dates.
- **MIT licensed**; CI badge + tests badge in the README.
- **Accessibility**: ARIA roles/labels, focus-visible styles, full keyboard support
  (`Ctrl/⌘+Enter` extract; `←/→` move card, `a` approve, `Delete` remove); responsive
  layout for narrow widths.
- **Tooling**: `anna-app validate --strict` passes; CI (validate + tests +
  mock-sampling AI check + live-harness E2E); demo fixtures; `preview.html` +
  `scripts/capture-shots.mjs` to generate screenshots and `docs/demo.gif`.
- **Docs**: README, ARCHITECTURE, DEMO (video script), PUBLISH, SUBMISSION.
- **Tests**: 7 suites, **168 assertions** (parser, board, i18n, contract, sampling,
  e2e, and a puppeteer **browser smoke test** that drives the real `app.js`).

### Fixed (found during QA)
- **`window.set_title` called with a bare string** instead of `{ title }` — the host
  bridge does `args.get("title")` and crashed (`'str' has no attribute 'get'`); the
  async rejection escaped the sync `try/catch`. Caught by the new browser smoke test.
  Now passes `{ title }` and swallows the promise.
- **Sampling wire shape**: send `messages[].content` as `{type:"text",text}` and read
  the reply from `result.content.text` (matches the real host) — previously used a
  plain string and would have silently fallen back to heuristic against live Anna.
- Priority `<select>` `input` event wrote concatenated option text to `priority`.
- `storage.get` has no `exists` field in the harness → `load()` checks
  `Array.isArray(value)` and normalizes records.
- `ui.host_api.tools` must use tool-id patterns (`required:*`), not method names.
- E2E suite used `process.exitCode` (not `process.exit()`) to avoid a Windows
  undici/libuv teardown crash.

### Refactored
- Pulled pure logic out of `app.js` into `parser.js` and `board.js` for testability.

### Known limitations
- The local MVP harness (`anna-app` 0.1.30) returns `not_implemented` for
  `tools.invoke`; the UI uses its in-browser parser locally. The tool's AI path is
  verified via `anna-app executa dev --mock-sampling` and routes correctly on the
  real platform.
- Not yet published to the Anna platform (needs `anna-app login` + minted Tool ID).
