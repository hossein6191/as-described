// The demo packs in lib/demo-packs.ts, checked against the limits the sell page and the contract
// enforce, from node with no network and no browser:
//
//   node --test tests/unit/demo-packs.test.mjs
//
// A demo pack is listed as it is, so a pack that breaks a limit would fail on the sell page or be
// refused by the contract in front of a newcomer. Node runs the TypeScript source directly;
// lib/demo-packs.ts imports nothing, which is what makes that possible.

import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_PACKS, WORLD_KNOWLEDGE_WORDS } from "../../lib/demo-packs.ts";

const KINDS = ["recipes", "templates", "notes", "prompts", "guide", "other"];
const charCount = (text) => Array.from(text).length;

test("every pack has one of the six kinds, and every kind has six packs", () => {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const p of DEMO_PACKS) {
    assert.ok(KINDS.includes(p.kind), `${p.title}: unknown kind "${p.kind}"`);
    counts[p.kind] += 1;
  }
  for (const k of KINDS) assert.equal(counts[k], 6, `${k} has ${counts[k]} packs`);
});

test("titles are unique and 3 to 60 characters", () => {
  const seen = new Set();
  for (const p of DEMO_PACKS) {
    const t = p.title.trim();
    assert.ok(t.length >= 3 && t.length <= 60, `title length ${t.length}: ${t}`);
    assert.ok(!seen.has(t), `duplicate title: ${t}`);
    seen.add(t);
  }
});

test("promises: 1 to 6 per pack, each 8 to 160 characters on one line, none leaning on world knowledge", () => {
  for (const p of DEMO_PACKS) {
    assert.ok(p.promises.length >= 1 && p.promises.length <= 6, `${p.title}: ${p.promises.length} promises`);
    for (const x of p.promises) {
      const t = x.trim();
      assert.ok(t.length >= 8 && t.length <= 160, `${p.title}: promise length ${t.length}: ${t}`);
      assert.ok(!/[\r\n]/.test(x), `${p.title}: promise on more than one line: ${t}`);
      const hits = WORLD_KNOWLEDGE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(x));
      assert.deepEqual(hits, [], `${p.title}: promise uses ${hits.join(", ")}: ${t}`);
    }
  }
});

test("sections: 1 to 20 per pack, none empty, none over 4000 characters", () => {
  for (const p of DEMO_PACKS) {
    assert.ok(p.sections.length >= 1 && p.sections.length <= 20, `${p.title}: ${p.sections.length} sections`);
    p.sections.forEach((s, i) => {
      assert.ok(s.trim().length > 0, `${p.title}: section ${i + 1} is empty`);
      assert.ok(charCount(s) <= 4000, `${p.title}: section ${i + 1} has ${charCount(s)} characters`);
    });
  }
});

test("price is 0.1 to 1000 GEN and the window is 5 minutes to 30 days", () => {
  for (const p of DEMO_PACKS) {
    assert.match(p.priceGen, /^\d+(\.\d+)?$/, `${p.title}: price "${p.priceGen}"`);
    const price = Number(p.priceGen);
    assert.ok(price >= 0.1 && price <= 1000, `${p.title}: price ${price}`);
    assert.ok(Number.isInteger(p.windowSeconds), `${p.title}: window ${p.windowSeconds}`);
    assert.ok(p.windowSeconds >= 300 && p.windowSeconds <= 30 * 86400, `${p.title}: window ${p.windowSeconds}`);
  }
});

test("every pack has a note and a hint, and the hint never names a section", () => {
  for (const p of DEMO_PACKS) {
    assert.ok(p.note.trim().length > 0, `${p.title}: empty note`);
    assert.ok(p.hint.trim().length > 0, `${p.title}: empty hint`);
    assert.ok(!/\bsection\s*\d/i.test(p.hint), `${p.title}: the hint names a section: ${p.hint}`);
  }
});

test("no pack text mentions Iran or Tehran", () => {
  for (const p of DEMO_PACKS) {
    const text = [p.title, p.note, p.hint, ...p.promises, ...p.sections].join("\n");
    assert.ok(!/\b(iran\w*|tehran)\b/i.test(text), `${p.title} mentions Iran or Tehran`);
  }
});
