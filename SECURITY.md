# Security notes

A light security review of Action Board's Anna surface. Scope: the app's own code
and its use of Anna primitives. Platform-level controls (iframe sandbox, JWT minting,
per-bundle CSP) are enforced by the Anna host; this app is built to respect them.

## Trust boundaries

Treat as **untrusted input**: the pasted notes, the **LLM's extracted output**
(arbitrary `task` / `owner` / `deadline` strings), and any state restored from storage
(could be stale or tampered). The app must render all of these safely.

## Findings & mitigations

| # | Area | Finding | Status |
|---|------|---------|--------|
| 1 | **XSS** | The owner filter built `<option>`s by string-interpolating owner names (which the LLM can produce) into `innerHTML` → HTML/JS injection. | **Fixed** — options are built with `createElement` + `textContent` (`syncOwnerFilter`). Regression-tested in `tests/ui-smoke.mjs` ("owner filter does not inject HTML"). |
| 2 | **XSS** | Card fields (task/owner/deadline) and the priority badge. | Safe — all set via `textContent` / `option.value`, never `innerHTML`. The only `innerHTML` writes are `= ""` (clearing). |
| 3 | **Least privilege** | `ui.host_api` grants. | Minimal: `storage: ["get","set"]` (the only methods the app calls), `tools: ["required:*"]` (the single declared tool), `chat: ["append_artifact","write_message"]`. `host_capabilities: ["llm.sample"]` only. No image/embed/upload/agent/files/OAuth grants. |
| 4 | **ACL enforcement** | Are ungranted methods actually blocked? | Verified: `storage.list` / `storage.delete` return `permission_denied` under the `get/set` grant (asserted in `tests/e2e-harness.test.mjs`). |
| 5 | **Executa protocol** | stdout discipline. | The tool writes **only** JSON-RPC to stdout and all logs to stderr (a stray byte would break framing / could be a smuggling vector). Large-response file transport not used. |
| 6 | **Secrets** | API keys / tokens. | None in the repo. Sampling uses the host LLM (no key); the per-window JWT is host-minted and never touched by app code. `invoke_id` is echoed on reverse-RPC for audit/billing. |
| 7 | **Dynamic code** | `eval` / `new Function` / `document.write`. | None. |
| 8 | **Data scope** | What the app can read/write. | APS default scope `app` / owner `self` — the user's own board only; no cross-owner or admin scopes requested. Stored data is the user's own notes. |
| 9 | **Chat write-back** | `chat.write_message` content. | User/LLM text is placed into **Markdown** (not HTML) and rendered by the host; it cannot inject into this app's DOM. Content is length-bounded by the host (≤4000 chars). |
| 10 | **Dependencies** | Supply chain. | Zero runtime dependencies. Dev-only: `gifenc`, `pngjs`, `puppeteer-core` (docs/tests). `npm audit` → 0 vulnerabilities. |

## Residual / by-design

- **Persistence across reload** in the local harness needs `--storage aps`; the default
  legacy backend is per-window. Not a vulnerability — a dev-mode storage scope.
- The in-browser parser fallback runs untrusted note text through regexes only (no
  execution); worst case is a mis-parsed card the user can edit or delete.

## Reporting

Please report security issues privately to the maintainer rather than via public issues.
