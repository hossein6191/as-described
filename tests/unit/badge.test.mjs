// The SVG badge /api/badge/[id] answers with, built from node with no network and no browser:
//
//   node --test tests/unit/badge.test.mjs
//
// The badge is drawn into other people's READMEs and pages, so what matters is that a listing's
// title or a message can never break out of the SVG, and that the box grows with the text.
// Node runs the TypeScript source directly; lib/badge.ts imports nothing, which is what makes that possible.

import test from "node:test";
import assert from "node:assert/strict";

import { badgeSvg, textWidth } from "../../lib/badge.ts";

const widthOf = (svg) => Number(/^<svg[^>]* width="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);

test("a badge is one SVG document, titled for screen readers", () => {
  const svg = badgeSvg("As Described", "3 sold · 0 broken · 1.5 GEN staked", "good");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /aria-label="As Described: 3 sold · 0 broken · 1\.5 GEN staked"/);
  assert.match(svg, /<title>As Described: 3 sold · 0 broken · 1\.5 GEN staked<\/title>/);
  assert.match(svg, /fill="#0f8a74"/);
});

test("text is escaped, so nothing in it can open an element or end an attribute", () => {
  const svg = badgeSvg(`a"b`, `<script>alert(1)</script> & 'x'`, "warn");
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &apos;x&apos;"));
  assert.ok(svg.includes("a&quot;b"));
});

test("the box grows with the message, and the logo takes room in the label", () => {
  const short = badgeSvg("As Described", "1 sold", "neutral");
  const long = badgeSvg("As Described", "12 sold · 3 broken · 250 GEN staked", "neutral");
  assert.ok(widthOf(long) > widthOf(short));
  assert.ok(widthOf(badgeSvg("As Described", "1 sold", "neutral", "M0 0h512v512H0Z")) > widthOf(short));
  assert.ok(textWidth("mmm") > textWidth("iii"));
  assert.equal(textWidth(""), 0);
});
