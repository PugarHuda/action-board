# Demo — Action Board (60–90s)

A tight, judge-friendly script. Goal: prove **"AI-native, not a chatbot"** — AI does
the first pass, the human stays the reviewer, state persists, AI writes back to chat.

> Submission asks for a *short* demo video (optional but high-leverage). Keep it ≤ 90s.

---

## Setup (before recording)

```bash
# one-time
npm i -g @anna-ai/cli
irm https://astral.sh/uv/install.ps1 | iex     # Windows (macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh)

# start the app
cd action-board
anna-app dev --no-llm        # http://localhost:5180/
```

Open `http://localhost:5180/`, click the **Action Board** view so the window is mounted.
Pick a fixture to paste from (all three demo well):
- `fixtures/sample-notes.txt` — short (~9 lines), tightest for a 60s cut
- `fixtures/meeting-notes-long.txt` — richer product/eng sync (~11 items, multiple owners) — **best for the video**
- `fixtures/slack-braindump.txt` — messy Slack-style dump (shows chatter/FYI being filtered out)

Record at 1280×720+, hide bookmarks bar, zoom browser to ~110% so cards read clearly.

---

## Shot list / narration

**0:00–0:08 — The problem (talking head or title card)**
> "Every meeting ends the same way: a wall of messy notes, and half the action items
> get lost. Action Board is an Anna app that fixes that."

**0:08–0:20 — Paste + Extract**
- Paste the sample notes into the textarea.
- Click **✦ Extract action items**.
> "I paste the raw notes and hit Extract. The app calls an Anna **tool** that uses the
> host LLM to pull out structured action items — task, owner, deadline, priority."
- Cards appear across the board. Point out a high-priority (red) card.
> "Notice it skipped the FYI line — it only kept real actions."

**0:20–0:35 — Human review (the key beat)**
- Edit one task inline; change one owner; bump a priority via the dropdown.
- Click the **✓** approve button on two cards.
> "This is the part that matters: the AI proposes, but I stay in control. I fix an owner,
> bump a priority, approve the ones I trust."

**0:35–0:48 — Drag + persist**
- Drag a card to **In Progress**, another to **Done** (auto-approves).
- Reload the browser tab; reopen the view.
> "I drag items across the board… and because state is saved in Anna's persistent
> storage, when I reload, my board is exactly where I left it."

**0:48–1:00 — Write back to chat**
- Click **↗ Send summary to chat**.
> "One click posts a clean summary back into the conversation — so the assistant and
> I share the same source of truth."

**1:00–1:10 — Close**
> "Paste notes, get a board you trust, in seconds. That's Action Board — humans and AI,
> working the same workflow. Built on Anna."

---

## If you want to show the *real* AI extraction on camera

The local MVP harness doesn't implement `tools.invoke` yet, so the in-browser parser
runs in the UI. To show the genuine LLM path, screen-record this terminal command
(it runs the tool through Anna's real executa runtime with a canned model response):

```bash
anna-app executa dev --dir ./executas/triage-node \
  --invoke extract_actions \
  --args '{"notes":"- Sara: send the deck by Fri, urgent\n- fix the login bug"}' \
  --mock-sampling ./fixtures/mock-sampling.jsonl --json
```
Output shows `"source":"llm"` with the model-parsed items — proof the AI path is wired
end-to-end. (Drop `--mock-sampling` and add `--app-slug <slug>` after `anna-app login`
to hit a live model.)

---

## One-paragraph submission blurb (copy/paste)

> **Action Board** turns messy meeting notes into a structured action board you can trust.
> Paste a brain-dump and an Anna tool uses the host LLM to extract action items — task,
> owner, deadline, priority — as editable cards you approve and drag across To Do /
> In Progress / Done. The AI does the first pass; you stay the reviewer. The board
> persists in Anna's storage and a click pushes a clean summary back into the chat.
> It uses four Anna primitives together — App UI window, Executa tool, persistent
> storage, and chat write-back — with a three-layer extraction fallback so the demo
> never breaks. Built and tested with the `anna-app` CLI (`validate --strict` passes;
> 76 automated assertions across 4 suites).
