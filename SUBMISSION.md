# Action Board — DoraHacks submission

_Copy/paste-ready writeup for the Anna AI-Native App Hackathon submission form._

---

## One-liner

**Paste messy meeting notes → get a structured action board you actually trust.**
The AI does the first pass; you stay the reviewer.

## Direction

**Productivity** (with a developer-tools flavour).

## The problem

Every meeting ends the same way: a wall of half-formed notes, and the action items
quietly get lost. The usual "AI" answer is a chatbot that spits text back at you — you
still have to copy, restructure, and track everything yourself.

## What it does

Action Board turns a raw brain-dump or transcript into **editable action-item cards**
— `task · owner · deadline · priority` — laid out on a **To Do / In Progress / Done**
board. You **edit, approve, and drag** them; the board **persists**; and one click
posts a clean **summary back into the conversation**.

1. Paste notes → **Extract**.
2. An Anna **Executa tool** uses the **host LLM** (reverse sampling, no API key) to
   pull out structured items. Status updates / FYIs are skipped.
3. Cards render with a **source badge** (AI vs rule-based parser) so you know what to
   trust. You fix owners, bump priorities, **approve**, and **drag** across columns.
4. State is saved to **Anna Persistent Storage**; **Send summary to chat** writes a
   structured artifact + readable message back into the thread.

## How AI is used (meaningfully, not a chatbot)

The model **participates inside the workflow** — it produces *structured* output
(typed JSON action items) consumed by real UI, not prose in a chat box. The human
keeps final say via approve / edit / drag. That's the "what comes after a chatbot"
answer: AI as a step in a tool, with a human-in-the-loop review surface.

## How it fits Anna

Uses **four Anna primitives together**:

| Primitive | Where |
|---|---|
| **App UI window** | the board (sandboxed SPA via the App UI SDK) |
| **Executa tool** | `action-triage` — JSON-RPC stdio plugin, host **sampling** |
| **Persistent storage (APS)** | the board survives reloads / devices |
| **Chat write-back** | `chat.append_artifact` + `chat.write_message` |

It also wires the agent path: the assistant can `open_app_view(view="board",
payload={notes})` and the board auto-extracts (`system_prompt_addendum` in the manifest).

## Working demo

- Runs locally in the Anna harness: `anna-app dev --no-llm` → `http://localhost:5180/`.
- `anna-app validate --strict` **passes** (schema + UI ACL + bundle linter).
- AI/sampling path verified through the real executa runtime:
  `anna-app executa dev --invoke extract_actions --mock-sampling fixtures/mock-sampling.jsonl`
  → `source: "llm"`.
- **The UI→Executa tool path is live locally:** `tools.invoke` is implemented in the
  current runtime (`anna-app-runtime-local 0.2.0a9`), so pasting notes runs through the
  real Executa tool end-to-end in the harness (E2E test asserts it).
- **Resilient by design:** extraction degrades host-LLM → tool heuristic → in-browser
  parser, so a board always appears even on a runtime without `tools.invoke`.

## Quality / execution

- **178 automated assertions** across 8 plain-Node suites (`npm test`): parser,
  board logic, i18n, Executa stdio contract, LLM/sampling mock-host, live-harness E2E,
  browser UI smoke, and Python-flavour parity.
- **CI** (GitHub Actions) runs validate + tests + the mock-sampling AI check + a
  live-harness E2E on every push. MIT licensed.
- Polished, **keyboard-accessible** UI (ARIA, focus-visible, arrow-key card moves);
  filter by owner, sort by priority, export to Markdown/CSV, quick-add, and a
  one-click **EN / ID** language toggle.
- Two language flavours of the tool (Node default, Python parity).

## Run it (judges)

```bash
npm i -g @anna-ai/cli
# uv (harness needs it): irm https://astral.sh/uv/install.ps1 | iex   (win)
#                        curl -LsSf https://astral.sh/uv/install.sh | sh (mac/linux)
cd action-board
anna-app dev --no-llm        # open http://localhost:5180/, open the board view
npm test                     # 168 assertions locally (178 on CI w/ Python)
```

Try it with `fixtures/meeting-notes-long.txt` or `fixtures/slack-braindump.txt`.

## Links

- **Repo:** https://github.com/PugarHuda/action-board
- **Live UI preview:** https://bundle-rust.vercel.app _(static SDK-free render; the
  functional app runs inside Anna via `anna-app dev`)_
- Demo video: _<add link, script in DEMO.md>_
- Built by: Pugar Huda Mantoro

**Suggested GitHub repo topics:** `anna` `ai-native` `llm` `productivity`
`meeting-notes` `kanban` `executa` `hackathon` `javascript`
(set via `gh repo edit --add-topic anna --add-topic ai-native …` after pushing).

## What's AI-generated vs authored

Built with the `anna-app` CLI scaffolding conventions; app logic, tests, and the
extraction tool are original. Screenshots/GIF generated from `bundle/preview.html`.
