// Unit tests for the i18n dictionary (bundle/i18n.js).
// Run: node tests/i18n.test.mjs

import { DICT, LANGS, t } from "../bundle/i18n.js";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log("i18n tests\n");

ok("langs are en + id", LANGS.join() === "en,id");

// key parity: every EN key exists in every other language
const enKeys = Object.keys(DICT.en);
for (const l of LANGS) {
  const missing = enKeys.filter((k) => !(k in DICT[l]));
  ok(`'${l}' has all ${enKeys.length} keys`, missing.length === 0, `(missing: ${missing.join(", ")})`);
  const extra = Object.keys(DICT[l]).filter((k) => !enKeys.includes(k));
  ok(`'${l}' has no extra keys`, extra.length === 0, `(extra: ${extra.join(", ")})`);
}

// no empty strings
for (const l of LANGS) {
  const empties = Object.entries(DICT[l]).filter(([, v]) => !String(v).trim());
  ok(`'${l}' has no empty values`, empties.length === 0, `(${empties.map(([k]) => k).join(", ")})`);
}

// translation + fallback
ok("t returns the right language", t("id", "clear") === "Bersihkan");
ok("t falls back to en for unknown lang", t("fr", "clear") === DICT.en.clear);
ok("t falls back to key for unknown key", t("en", "nope_nope") === "nope_nope");

// interpolation
ok("t interpolates vars",
  t("en", "added", { n: 3, s: "s", src: "AI", dup: "" }) === "Added 3 items (AI). Review & approve →");
ok("t interpolates id template",
  t("id", "added", { n: 2, s: "", src: "AI", dup: "" }) === "Menambahkan 2 item (AI). Tinjau & setujui →");
ok("t leaves no unfilled placeholders",
  !/\{\w+\}/.test(t("en", "added", { n: 1, s: "", src: "x", dup: "" })));
ok("missing var -> empty, not literal brace",
  !t("en", "extractFail", {}).includes("{e}"));

// priority labels differ by language (proves they're localized)
ok("priority labels localized", t("id", "prioHigh") === "Tinggi" && t("en", "prioHigh") === "High");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
