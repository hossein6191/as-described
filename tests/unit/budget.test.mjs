// The budgets the delivery API keeps, run from node with no network, no browser and no chain:
//
//   node --test tests/unit/budget.test.mjs
//
// These decide who may spend the server's Studio budget, and nothing above them costs the caller
// anything: the status route asks for no wallet at all, and signing a read message is free and
// local. The site e2e cannot reach them, because it sets CONTRACT, which makes the throwaway
// register the site default, and checkRegister short-circuits on that before any of this runs.
// Node runs the TypeScript source directly; lib/budget.ts imports nothing, which is what makes
// that possible. Every function takes `now`, so each test states its own minute and no test can
// spend another's bucket.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKS_PER_MINUTE,
  LOOKUPS_PER_CALLER,
  LOOKUPS_PER_MINUTE,
  MAX_CALLERS,
  READS_PER_MINUTE,
  SHARED_CALLER,
  callerOf,
  createBoundedMemo,
  takeChainRead,
  takeDeliveryCheck,
  takeLookup,
} from "../../lib/budget.ts";

/** A minute nothing else in this file uses, so the rolling windows start empty. */
let clock = Date.parse("2026-09-23T00:00:00Z");
const freshMinute = () => (clock += 3_600_000);

const asRequest = (headers) => new Request("https://as-described.vercel.app/api/packs/L1/status", { headers });

test("the caller is read from a header the host writes, never from the head of x-forwarded-for", () => {
  // The proxy's own headers win, whatever the caller sent.
  assert.equal(callerOf(asRequest({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "9.9.9.1" })), "203.0.113.9");
  assert.equal(callerOf(asRequest({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "9.9.9.1" })), "203.0.113.9");
  // x-forwarded-for is a list the caller can start: each proxy APPENDS what it saw, so the
  // trustworthy entry is the last one. A caller who prepends an address changes nothing.
  assert.equal(callerOf(asRequest({ "x-forwarded-for": "9.9.9.1, 203.0.113.9" })), "203.0.113.9");
  assert.equal(callerOf(asRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" })), "203.0.113.9");
  assert.equal(callerOf(asRequest({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  // Nothing identifies the caller: one shared bucket, which the signed routes key on the signer.
  assert.equal(callerOf(asRequest({})), SHARED_CALLER);
  assert.equal(callerOf(asRequest({ "x-forwarded-for": "  ,  " })), SHARED_CALLER);
  // A header long enough to be a key of its own is cut, so one caller cannot fill the map.
  assert.equal(callerOf(asRequest({ "x-real-ip": "x".repeat(400) })).length, 64);
});

test("rotating x-forwarded-for does not buy a second read budget", () => {
  const now = freshMinute();
  const spend = (xff) => takeChainRead(callerOf(asRequest({ "x-forwarded-for": xff })), now);
  for (let i = 0; i < READS_PER_MINUTE; i++) {
    assert.equal(spend(`${i}.0.0.1, 203.0.113.50`), true, `read ${i + 1}`);
  }
  // The head of the list changed every time; the entry the proxy appended did not.
  assert.equal(spend("9.9.9.9, 203.0.113.50"), false);
  assert.equal(spend("203.0.113.50"), false);
  // Another caller still has its own.
  assert.equal(spend("203.0.113.51"), true);
});

test("a read budget is per caller and rolls off after a minute", () => {
  const now = freshMinute();
  for (let i = 0; i < READS_PER_MINUTE; i++) assert.equal(takeChainRead("10.0.0.1", now + i), true);
  assert.equal(takeChainRead("10.0.0.1", now + READS_PER_MINUTE), false);
  assert.equal(takeChainRead("10.0.0.2", now + READS_PER_MINUTE), true); // one caller never spends another's
  assert.equal(takeChainRead("10.0.0.1", now + 59_999), false); // still inside the minute
  assert.equal(takeChainRead("10.0.0.1", now + 60_001), true); // the first stamp has rolled off
});

test("the read budget map is bounded, so callers cannot fill the instance", () => {
  const now = freshMinute();
  for (let i = 0; i < MAX_CALLERS + 50; i++) assert.equal(takeChainRead(`bulk-${now}-${i}`, now), true);
  // The map evicts the oldest key, so the newest caller is still counted and is still limited.
  const last = `bulk-${now}-${MAX_CALLERS + 49}`;
  for (let i = 1; i < READS_PER_MINUTE; i++) assert.equal(takeChainRead(last, now), true, `read ${i + 1}`);
  assert.equal(takeChainRead(last, now), false);
});

test("a delivery check has its own, looser budget than a chain read", () => {
  const now = freshMinute();
  // A shop page asks once per pack, and on a host that writes no forwarding header every
  // visitor shares one bucket, so this budget has to hold several full pages, not ten requests.
  assert.ok(CHECKS_PER_MINUTE >= 5 * READS_PER_MINUTE, `${CHECKS_PER_MINUTE} vs ${READS_PER_MINUTE}`);
  for (let i = 0; i < CHECKS_PER_MINUTE; i++) assert.equal(takeDeliveryCheck(SHARED_CALLER, now), true, `check ${i + 1}`);
  assert.equal(takeDeliveryCheck(SHARED_CALLER, now), false);
  // It is a separate count: spending it does not spend the chain reads the signed routes need.
  assert.equal(takeChainRead(SHARED_CALLER, now), true);
  assert.equal(takeDeliveryCheck(SHARED_CALLER, now + 60_001), true);
});

test("one caller cannot spend the whole instance's register lookups", () => {
  const now = freshMinute();
  for (let i = 0; i < LOOKUPS_PER_CALLER; i++) assert.equal(takeLookup("198.51.100.7", now), true, `lookup ${i + 1}`);
  // This is the finding: a few plain GETs with made-up register addresses used to turn own-register
  // delivery off for every visitor. Now only this caller is refused.
  assert.equal(takeLookup("198.51.100.7", now), false);
  assert.equal(takeLookup("198.51.100.8", now), true);
});

test("the instance ceiling still holds when many callers each spend their own", () => {
  const now = freshMinute();
  let taken = 0;
  for (let i = 0; i < LOOKUPS_PER_MINUTE + 20; i++) if (takeLookup(`${now}-caller-${i}`, now)) taken++;
  assert.equal(taken, LOOKUPS_PER_MINUTE);
  assert.ok(LOOKUPS_PER_MINUTE * 2 < 30, "each lookup may fetch twice, inside Studio's 30 gen_call a minute");
  assert.equal(takeLookup(`${now}-caller-fresh`, now + 60_001), true); // the window rolls off
});

test("a remembered answer is bounded, and a stale one is forgotten rather than served", () => {
  const memo = createBoundedMemo(3);
  memo.remember("a", { kind: "ours" }, 1000);
  memo.remember("b", { kind: "missing" }, 1000);
  assert.deepEqual(memo.recalled("a"), { kind: "ours" });
  assert.equal(memo.recalled("nothing"), null);
  // "Studio has no contract there" is Studio's answer for about a minute after a deploy, so it
  // is kept only briefly: past the age the caller names, it is dropped and asked again.
  const stale = (v, age) => v.kind === "missing" && age > 15_000;
  assert.deepEqual(memo.recalled("b", stale, 10_000), { kind: "missing" });
  assert.equal(memo.recalled("b", stale, 20_000), null);
  assert.equal(memo.recalled("b", stale, 20_001), null); // and it really was forgotten
  assert.deepEqual(memo.recalled("a", stale, 10_000_000), { kind: "ours" }); // a settled answer does not age out
  // Bounded: the oldest write is dropped first.
  for (const k of ["c", "d", "e", "f"]) memo.remember(k, { kind: "ours" }, 2000);
  assert.ok(memo.size() <= 3, `size ${memo.size()}`);
  assert.equal(memo.recalled("c"), null);
  assert.deepEqual(memo.recalled("f"), { kind: "ours" });
});
