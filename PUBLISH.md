# Publishing Action Board

End-to-end publish flow using the `anna-app` CLI (v0.1.30). Commands verified to exist
via `anna-app <cmd> --help`; the network steps require an account and a live nexus host.

> **Tool IDs are mint-only.** Anna assigns `tool_id` server-side — you can't type a custom
> one. The repo ships placeholder `tool-dev-action-triage` for local dev; publishing the
> Executa rewrites it to the real minted id.

---

## 0. Prerequisites

```bash
npm i -g @anna-ai/cli
# uv (for local runs): Windows  irm https://astral.sh/uv/install.ps1 | iex
anna-app doctor
```

## 1. Log in (device flow → saves a PAT)

```bash
anna-app login --host <NEXUS_BASE_URL>      # ask the Anna team / Discord for the host
anna-app whoami
```

## 2. Set your developer handle (one-time)

Your apps publish under `@handle/slug`. Required before your first app.

```bash
anna-app account set-handle <your-handle>
```

## 3. Publish the Executa tool (mints the real tool_id)

From the tool directory (it has `executa.json` in cwd):

```bash
cd executas/triage-node
anna-app executa publish              # mints tool_id, writes .anna/executa.json
anna-app executa list                 # confirm it's registered
```

Note the minted id (looks like `tool-<handle>-action-triage-<uniq>`).

## 4. Point the app at the minted tool_id

Replace the dev placeholder in three places (or script it):

- `manifest.json` → `required_executas[].tool_id` **and** `ui.host_api.tools` (if you used a bare id)
- `bundle/app.js` → `const TOOL_ID = "…"`
- (the `dev` block can keep pointing at the local dir)

```bash
# quick sanity: nothing should still say the dev id except dev config
grep -rn "tool-dev-action-triage" manifest.json bundle/app.js
```

Re-validate:

```bash
anna-app validate --strict
```

## 5. Publish the Anna App

From the project root (it has `manifest.json` + `bundle/`):

```bash
anna-app apps publish                 # or: anna-app publish  (auto-detects app vs executa)
# uploads manifest + bundle as a working draft
```

Useful sub-commands (`anna-app apps --help`):

| Command | What it does |
|---|---|
| `apps push` | upsert the mutable working draft (manifest + bundle, no freeze) |
| `apps cut <version>` | snapshot the draft into an immutable version (freezes deps) |
| `apps sync-meta` | push store metadata (name/tagline/…) from the manifest/app.json |
| `apps submit-review [slug]` | move DRAFT → PENDING_REVIEW |
| `apps release <version>` | freeze & publish an existing version (go live) |
| `apps status <slug>` | show server-known lifecycle state |
| `apps versions <slug>` | list all server versions |

## 6. Submit for review → publish

```bash
anna-app apps cut 0.1.0
anna-app apps submit-review action-board
# after approval:
anna-app apps release 0.1.0
anna-app apps status action-board
```

---

## Mapping to the Anna docs flow

This mirrors the documented steps (Anna Developer Hub → "Publishing an App"):
1. Mint Executa ids → 2. wire ids into manifest/bundle → 3. create the listing
(`app.json`) → 4. create a version (manifest + bundle upload) → 5. submit → 6. release.

If a command name differs on your CLI version, run `anna-app <group> --help`
(`account`, `executa`, `apps`, `publish`, `token`) — the groups are stable.

## Troubleshooting

- **`validate` fails on `ui.host_api.tools`** — entries must be tool_id *patterns*
  (`required:*`, `optional:*`, a bare/minted id, or `<prefix>:<id>`), **not** method
  names like `"list"`.
- **Sampling falls back to heuristic in production** — confirm the manifest has
  `host_capabilities: ["llm.sample"]` and the user granted it; the tool sends
  `messages[].content` as `{type:"text",text:…}` and reads `result.content.text`.
- **Can't pick a tool_id** — correct; it's mint-only. Use the id from `executa publish`.
