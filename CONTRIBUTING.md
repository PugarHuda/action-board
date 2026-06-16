# Contributing to Action Board

Thanks for your interest! This is a small, focused Anna app — contributions that keep
it focused and well-tested are very welcome.

## Setup

```bash
npm i -g @anna-ai/cli          # the Anna dev CLI
# uv (harness Python bridge):  irm https://astral.sh/uv/install.ps1 | iex   (win)
#                              curl -LsSf https://astral.sh/uv/install.sh | sh (mac/linux)
git clone <your fork>
cd action-board
anna-app doctor                # verify environment
```

## Develop

```bash
anna-app dev --no-llm          # http://localhost:5180/ — hot-reloads the bundle
npm test                       # 6 suites (E2E auto-skips if no harness is running)
anna-app validate --strict     # schema + UI ACL + bundle linter
```

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md). The important rule:

> **Keep logic in the pure modules.** `bundle/app.js` is thin glue around the Anna
> SDK and the DOM. Anything testable (parsing, board math, i18n) lives in
> `bundle/parser.js`, `bundle/board.js`, `bundle/i18n.js` — no DOM, no SDK — and gets
> unit tests under `tests/`.

The extraction tool ships in two flavours (`executas/triage-node`,
`executas/triage-python`) that implement the **same** JSON-RPC contract — keep them in
sync, including the heuristic word lists and the date regex.

## Expectations for a PR

- `npm test` is green and `anna-app validate --strict` passes.
- New behavior comes with a test (we have no framework — just `node tests/x.mjs` with
  a tiny `ok(name, cond)` helper; copy an existing suite).
- i18n: if you add UI text, add the key to **both** `en` and `id` in
  `bundle/i18n.js` (the `i18n` suite enforces key parity).
- Update `CHANGELOG.md` under **Unreleased**.
- Keep the diff focused; match the surrounding code style.

## Regenerating screenshots / GIF

```bash
anna-app dev --no-llm &        # in one terminal
npm run shots                  # writes docs/screenshot*.png + docs/demo.gif
```

## Reporting bugs / ideas

Open an issue using the templates. For security-sensitive reports, please avoid public
issues and contact the maintainer directly.

By contributing you agree your work is licensed under the project's [MIT License](LICENSE).
