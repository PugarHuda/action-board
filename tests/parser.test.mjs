// Unit tests for the shared in-browser parser (bundle/parser.js).
// Pure functions, no DOM — adversarial inputs included. Run: node tests/parser.test.mjs

import { localExtract, cleanTask, itemKey } from "../bundle/parser.js";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log("parser unit tests\n");

// --- cleanTask ---
ok("cleanTask strips '@Sara to'", cleanTask("@Sara to send the deck") === "Send the deck");
ok("cleanTask strips 'Tom will'", cleanTask("Tom will fix the bug") === "Fix the bug");
ok("cleanTask strips trailing ', urgent'", cleanTask("review the PR, urgent") === "Review the PR");
ok("cleanTask strips trailing 'p1'", cleanTask("ship the build p1") === "Ship the build");
ok("cleanTask capitalizes", cleanTask("follow up with vendor")[0] === "F");
ok("cleanTask on empty -> empty", cleanTask("") === "");
ok("cleanTask trims trailing period", !cleanTask("send the email.").endsWith("."));

// --- localExtract: basic ---
const basic = localExtract(
  "- @Sara to send the deck by Fri, urgent\n" +
  "- Tom will fix the login bug tomorrow\n" +
  "- follow up with the vendor\n" +
  "- we shipped search, FYI\n" +
  "- random chit-chat about the weather"
);
ok("extracts 3 real actions", basic.length === 3, `(got ${basic.length}: ${JSON.stringify(basic.map(i=>i.task))})`);
ok("owner Sara captured", basic.some((i) => i.owner === "Sara"));
ok("owner Tom captured", basic.some((i) => i.owner === "Tom"));
ok("deadline Fri captured", basic.some((i) => /fri/i.test(i.deadline)));
ok("urgent -> high", basic.some((i) => i.priority === "high"));
ok("skips FYI status line", !basic.some((i) => /shipped/i.test(i.task)));
ok("skips chit-chat", !basic.some((i) => /weather/i.test(i.task)));

// --- adversarial / edge cases ---
ok("empty string -> []", localExtract("").length === 0);
ok("null -> []", localExtract(null).length === 0);
ok("undefined -> []", localExtract(undefined).length === 0);
ok("whitespace only -> []", localExtract("   \n\t \n").length === 0);
ok("very short lines ignored", localExtract("a\nb\nfix").length === 0);
ok("CRLF line endings handled", localExtract("- fix the bug\r\n- ship it tonight").length === 2);
ok("various bullets (*, •, –) stripped",
  localExtract("* send report\n• call client\n– deploy service").length === 3);

// priority precedence + low detection
// (note: LOW/HIGH keywords only apply once a line is recognized as an action,
//  i.e. it must contain an action verb — "dark mode someday" has none and is
//  intentionally skipped.)
const prio = localExtract("- fix this asap\n- build dark mode someday\n- write the doc");
ok("asap -> high", prio.find((i) => /fix this/i.test(i.task))?.priority === "high");
ok("verb + someday -> low", prio.find((i) => /dark mode/i.test(i.task))?.priority === "low");
ok("plain action -> medium", prio.find((i) => /write the doc/i.test(i.task))?.priority === "medium");
ok("line with no verb is skipped", localExtract("- dark mode someday").length === 0);

// no false-positive owner from sentence-start capital
const noOwner = localExtract("- Send the weekly report");
ok("no spurious owner when no assignment cue", noOwner[0]?.owner === "");

// every item has all 4 fields and a valid priority
ok("every item well-formed",
  basic.every((i) => "task" in i && "owner" in i && "deadline" in i &&
    ["high", "medium", "low"].includes(i.priority)));

// long input doesn't explode (perf/robustness smoke)
const big = Array.from({ length: 2000 }, (_, n) => `- fix issue number ${n} today`).join("\n");
const bigOut = localExtract(big);
ok("handles 2000 lines", bigOut.length === 2000, `(got ${bigOut.length})`);
ok("all high (today)", bigOut.every((i) => i.priority === "high"));

// HTML-ish text is treated as plain text (no parsing/injection in parser layer)
const htmlish = localExtract("- send <script>alert(1)</script> to the team");
ok("html kept as literal task text", htmlish.length === 1 && htmlish[0].task.includes("<script>"));

// --- expanded verbs + chatter filtering ---
ok("verb 'finalize' detected", localExtract("- finalize the launch deck").length === 1);
ok("verb 'wire up' detected", localExtract("- wire up the pricing page").length === 1);
ok("verb 'rotate' detected", localExtract("- rotate the staging keys").length === 1);
ok("verb 'migrate' detected", localExtract("- migrate the wiki someday").length === 1);
ok("chatter 'lol …' skipped even with verb-ish words",
  localExtract("- lol that meeting could've been an email").length === 0);
ok("chatter 'thanks …' skipped", localExtract("- thanks for shipping the fix!").length === 0);
ok("chatter 'great job …' skipped", localExtract("- great job on the migration").length === 0);
ok("real action after chatter lines still found",
  localExtract("- lol nice\n- thanks all\n- fix the bug").length === 1);

// --- smarter date detection ---
const dl = (s) => (localExtract("- review the doc by " + s)[0] || {}).deadline || "";
ok("date: ISO", dl("2026-06-20").toLowerCase().includes("2026-06-20"));
ok("date: weekday + ordinal 'Friday the 20th'", /friday the 20th/i.test(dl("Friday the 20th")));
ok("date: month + day 'Jun 20'", /jun\s*20/i.test(dl("Jun 20")));
ok("date: full month 'September 3rd'", /september 3rd/i.test(dl("September 3rd")));
ok("date: relative 'in 3 days'", /in 3 days/i.test(dl("in 3 days")));
ok("date: 'next month'", /next month/i.test(dl("next month")));
ok("date: 'end of week'", /end of week/i.test(dl("end of week")));
ok("date: bare 'tomorrow'", dl("tomorrow").toLowerCase() === "tomorrow");
ok("no date -> empty deadline", dl("the way I like it").length >= 0 && (localExtract("- review the doc")[0] || {}).deadline === "");

// --- itemKey dedupe helper ---
ok("itemKey normalizes case + spaces",
  itemKey({ task: "  Send  The   Deck " }) === itemKey({ task: "send the deck" }));
ok("itemKey distinguishes different tasks",
  itemKey({ task: "send deck" }) !== itemKey({ task: "send report" }));
ok("itemKey on empty item -> ''", itemKey({}) === "" && itemKey(null) === "");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
