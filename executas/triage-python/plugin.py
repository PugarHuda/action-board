#!/usr/bin/env python3
"""Action Triage — an Anna Executa (Tool) plugin.

Turns raw meeting notes / brain-dumps into structured action items:
    { task, owner, deadline, priority }

Protocol: JSON-RPC 2.0 over stdio, one message per line (LF-delimited UTF-8).
  - stdout is PROTOCOL ONLY. All logs go to stderr.
  - flush after every write.
  - keep the loop alive until EOF (needed for reverse-RPC sampling).

The tool tries to extract via the host LLM (reverse "sampling/createMessage",
no API key needed). If sampling is unavailable in the current context, it
falls back to a deterministic heuristic parser so the demo always works.
"""

import sys
import json
import re

# Force UTF-8, line-buffered stdout so each JSON-RPC frame is flushed.
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def write(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def send_result(req_id, result):
    write({"jsonrpc": "2.0", "id": req_id, "result": result})


def send_error(req_id, code, message, data=None):
    err = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    write({"jsonrpc": "2.0", "id": req_id, "error": err})


# ---------------------------------------------------------------------------
# describe — return the bare manifest (NOT wrapped)
# ---------------------------------------------------------------------------

MANIFEST = {
    "name": "action-triage",
    "display_name": "Action Triage",
    "version": "0.1.0",
    "description": "Extract structured action items (task, owner, deadline, priority) from raw notes.",
    "tools": [
        {
            "name": "extract_actions",
            "description": (
                "Read raw meeting notes or a brain-dump and return a list of "
                "structured action items. Each item has: task, owner, deadline, "
                "priority (high|medium|low). Use this whenever the user shares "
                "notes and wants tasks pulled out."
            ),
            "parameters": [
                {
                    "name": "notes",
                    "type": "string",
                    "description": "The raw notes / meeting transcript / brain-dump text.",
                    "required": True,
                },
                {
                    "name": "context",
                    "type": "string",
                    "description": "Optional context, e.g. team names or the meeting topic.",
                    "required": False,
                },
            ],
            "timeout": 60,
        }
    ],
    "credentials": [],
    "host_capabilities": ["llm.sample"],
    "runtime": {"type": "uv", "min_version": "0.1.0"},
    "author": "Hackathon Submission",
}


# ---------------------------------------------------------------------------
# Reverse-RPC: borrow the host LLM (sampling/createMessage)
# ---------------------------------------------------------------------------

_rev_id = [9000]


def _extract_text(result):
    """Anna returns content as {"type":"text","text":"…"}; accept str / list too."""
    c = (result or {}).get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, dict) and isinstance(c.get("text"), str):
        return c["text"]
    if isinstance(c, list):
        return "".join(b if isinstance(b, str) else (b.get("text") or "") for b in c)
    return ""


def host_sample(prompt, max_tokens, invoke_id):
    """Send sampling/createMessage to the host and block for the matching reply.

    Raises on any failure so the caller can fall back to the heuristic parser.
    """
    _rev_id[0] += 1
    rid = _rev_id[0]
    write({
        "jsonrpc": "2.0",
        "id": rid,
        "method": "sampling/createMessage",
        "params": {
            # content as a typed block — matches the host wire format.
            "messages": [{"role": "user", "content": {"type": "text", "text": prompt}}],
            "maxTokens": max_tokens,
            "metadata": {"invoke_id": invoke_id},
        },
    })
    # Read until we see the response carrying our id.
    while True:
        line = sys.stdin.readline()
        if not line:
            raise RuntimeError("stdin EOF while awaiting sampling response")
        line = line.strip()
        if not line:
            continue
        msg = json.loads(line)
        if msg.get("id") == rid:
            if "error" in msg:
                raise RuntimeError(str(msg["error"].get("message", "sampling error")))
            return _extract_text(msg["result"])
        # Any other frame mid-invoke is unexpected; log and keep waiting.
        log("ignoring interleaved frame:", msg.get("method") or msg.get("id"))


EXTRACTION_PROMPT = """You are a precise meeting-notes triage assistant.
Read the NOTES and extract concrete action items only (skip status updates and FYIs).

Return ONLY a JSON array, no prose, no code fences. Each element:
{
  "task": "<imperative, concise>",
  "owner": "<name or empty string if unknown>",
  "deadline": "<as written, e.g. 'Fri', '2026-06-20', or empty string>",
  "priority": "high" | "medium" | "low"
}

CONTEXT: {context}

NOTES:
{notes}
"""


def extract_with_llm(notes, context, invoke_id):
    prompt = EXTRACTION_PROMPT.replace("{context}", context or "(none)").replace("{notes}", notes)
    content = host_sample(prompt, max_tokens=1200, invoke_id=invoke_id)
    return parse_json_items(content)


def parse_json_items(content):
    """Pull a JSON array out of an LLM response, tolerating code fences."""
    text = content.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("no JSON array in LLM output")
    data = json.loads(text[start:end + 1])
    items = []
    for it in data:
        if not isinstance(it, dict):
            continue
        task = str(it.get("task", "")).strip()
        if not task:
            continue
        prio = str(it.get("priority", "medium")).lower()
        if prio not in ("high", "medium", "low"):
            prio = "medium"
        items.append({
            "task": task,
            "owner": str(it.get("owner", "")).strip(),
            "deadline": str(it.get("deadline", "")).strip(),
            "priority": prio,
        })
    return items


# ---------------------------------------------------------------------------
# Heuristic fallback parser (works with zero LLM access)
# ---------------------------------------------------------------------------

_ACTION_VERBS = (
    "send", "email", "call", "write", "draft", "review", "fix", "ship",
    "build", "create", "update", "schedule", "book", "prepare", "follow",
    "finish", "deploy", "test", "investigate", "research", "design",
    "deliver", "share", "set up", "setup", "add", "remove", "check",
    "finalize", "rotate", "migrate", "wire", "plan", "coordinate",
    "approve", "merge", "refactor", "document", "organize", "audit", "upgrade",
)
_HIGH = ("urgent", "asap", "critical", "blocker", "today", "p0", "p1", "!!")
_LOW = ("someday", "nice to have", "low priority", "eventually", "backlog")
_CHATTER = ("lol", "haha", "thanks", "thank you", "great job", "good job", "nice work", "kudos", "shoutout")
_DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|today|tomorrow|tonight|eod|"
    r"mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|"
    r"next week|this week|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b"
    r"(\s+\d{1,2})?",
    re.IGNORECASE,
)
_OWNER_AT = re.compile(r"@([A-Za-z][\w-]*)")
_OWNER_ASSIGN = re.compile(
    r"\b([A-Z][a-z]+)\s+(?:to|will|should|needs to|is going to)\b"
)


def clean_task(text):
    t = text
    t = re.sub(r"^@[A-Za-z][\w-]*\s+(?:to|will|should|needs to|is going to)\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^@[A-Za-z][\w-]*[:\s]+", "", t)
    t = re.sub(r"^[A-Z][a-z]+\s+(?:to|will|should|needs to|is going to)\s+", "", t)
    t = re.sub(r"[\s,;\-]+(urgent|asap|critical|p0|p1|!!)\.?$", "", t, flags=re.IGNORECASE)
    t = t.strip().rstrip(".")
    return (t[0].upper() + t[1:]) if t else t


def heuristic_extract(notes, context=""):
    items = []
    for raw in notes.splitlines():
        line = raw.strip().lstrip("-*•– \t")
        if len(line) < 4:
            continue
        low = line.lower()
        if any(low.startswith(c) for c in _CHATTER):
            continue
        is_action = (
            any(low.startswith(v) or (" " + v + " ") in (" " + low + " ") for v in _ACTION_VERBS)
            or "todo" in low
            or "action item" in low
            or low.startswith("[ ]")
            or "follow up" in low
        )
        if not is_action:
            continue

        owner = ""
        m = _OWNER_AT.search(line)
        if m:
            owner = m.group(1)
        else:
            m2 = _OWNER_ASSIGN.search(line)
            if m2:
                owner = m2.group(1)

        deadline = ""
        md = _DATE_RE.search(line)
        if md:
            deadline = md.group(0).strip()

        priority = "medium"
        if any(k in low for k in _HIGH):
            priority = "high"
        elif any(k in low for k in _LOW):
            priority = "low"

        task = re.sub(r"^\[\s?\]\s*", "", line)
        task = re.sub(r"^(todo|action item)\s*[:\-]\s*", "", task, flags=re.IGNORECASE)
        task = clean_task(task)
        if task:
            items.append({
                "task": task,
                "owner": owner,
                "deadline": deadline,
                "priority": priority,
            })
    return items


# ---------------------------------------------------------------------------
# invoke
# ---------------------------------------------------------------------------

def handle_invoke(req_id, params):
    tool = params.get("tool")
    args = params.get("arguments", {}) or {}
    invoke_id = params.get("invoke_id")

    if tool != "extract_actions":
        send_error(req_id, -32601, f"Unknown tool: {tool}")
        return

    notes = (args.get("notes") or "").strip()
    context = (args.get("context") or "").strip()
    if not notes:
        send_result(req_id, {
            "success": False,
            "error": "No notes provided. Paste some text first.",
            "tool": tool,
        })
        return

    source = "llm"
    try:
        import os
        if os.environ.get("ACTION_TRIAGE_NO_SAMPLE"):
            raise RuntimeError("sampling disabled (offline mode)")
        items = extract_with_llm(notes, context, invoke_id)
        if not items:
            raise ValueError("LLM returned no items")
    except Exception as e:  # noqa: BLE001 — fallback is intentional and demo-critical
        log("sampling failed, using heuristic fallback:", repr(e))
        items = heuristic_extract(notes, context)
        source = "heuristic"

    send_result(req_id, {
        "success": True,
        "data": {"items": items, "source": source, "count": len(items)},
        "tool": tool,
    })


# ---------------------------------------------------------------------------
# main loop
# ---------------------------------------------------------------------------

def main():
    log("action-triage plugin up")
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break  # EOF
            line = line.strip()
            if not line:
                continue
            req = json.loads(line)
            method = req.get("method")
            req_id = req.get("id")
            params = req.get("params", {}) or {}

            if method == "describe":
                send_result(req_id, MANIFEST)
            elif method == "initialize":
                send_result(req_id, {
                    "protocolVersion": "2.0",
                    "client_capabilities": {"sampling": {}},
                })
            elif method == "invoke":
                handle_invoke(req_id, params)
            elif method == "health":
                send_result(req_id, {"status": "healthy", "tools_count": 1})
            else:
                send_error(req_id, -32601, "Method not found")
        except json.JSONDecodeError:
            log("dropped non-JSON line")
        except Exception as e:  # noqa: BLE001
            log("unhandled error:", repr(e))
            write({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": "Internal error", "data": {"exception": str(e)}},
            })


if __name__ == "__main__":
    main()
