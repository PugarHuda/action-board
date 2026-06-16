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
- **Resilient by design:** extraction degrades host-LLM → tool heuristic → in-browser
  parser, so a board always appears (the current MVP harness hasn't implemented
  `tools.invoke` yet, so the UI uses the in-browser parser locally).

## Quality / execution

- **133 automated assertions** across 5 plain-Node suites (`npm test`): parser,
  board logic, Executa stdio contract, LLM/sampling mock-host, live-harness E2E.
- **CI** (GitHub Actions) runs validate + tests + the mock-sampling AI check + a
  live-harness E2E on every push.
- Polished, **keyboard-accessible** UI (ARIA, focus-visible, arrow-key card moves);
  filter by owner, sort by priority, export to Markdown/CSV.
- Two language flavours of the tool (Node default, Python parity).

## Run it (judges)

```bash
npm i -g @anna-ai/cli
# uv (harness needs it): irm https://astral.sh/uv/install.ps1 | iex   (win)
#                        curl -LsSf https://astral.sh/uv/install.sh | sh (mac/linux)
cd action-board
anna-app dev --no-llm        # open http://localhost:5180/, open the board view
npm test                     # 133 assertions
```

Try it with `fixtures/meeting-notes-long.txt` or `fixtures/slack-braindump.txt`.

## Links

- Repo: _<add your Git URL>_
- Demo video: _<add link, script in DEMO.md>_
- Built by: _<your name / team>_

## What's AI-generated vs authored

Built with the `anna-app` CLI scaffolding conventions; app logic, tests, and the
extraction tool are original. Screenshots/GIF generated from `bundle/preview.html`.
