// What one caller of the delivery API may spend in a minute, and the bounded map the answers
// live in. Server side only, and one module per server instance, which is all a budget can be
// without a store of its own; a deployment that runs several instances has one of these each.
//
// This file imports nothing, on purpose: it is the part of the delivery API that can be run and
// checked without a network, a browser or a chain (tests/unit/budget.test.mjs). Every function
// takes `now`, so a test states the minute it is testing instead of waiting for one.

/** Chain reads one caller may cause through the delivery routes in a minute. */
export const READS_PER_MINUTE = 10;

/**
 * Delivery checks one caller may make in a minute.
 *
 * The status route costs no contract view call at all: on the site's own register it is one
 * lookup in the pack store, which a deployment pays for and anybody can ask for in a loop with
 * no wallet. It still needs a ceiling, but a much higher one than a chain read, because a page
 * asks it once per pack on the shelf: a shop of a dozen packs is a dozen checks in one load,
 * and on a host that writes no forwarding header every visitor shares one bucket. Sixty is
 * several full pages a minute per caller and still bounds what a loop can spend.
 */
export const CHECKS_PER_MINUTE = 60;

/**
 * Code lookups for unknown registers, per caller and for the whole instance, in a minute.
 *
 * One lookup is up to two gen_getContractCode against Studio, out of the same 30 a minute the
 * routes' own view calls need, and nothing in front of it costs the caller anything: no wallet,
 * no signature, not even a POST body. A single instance-wide count was therefore a switch any
 * visitor could throw: a couple of dozen plain GETs with made-up addresses made every route
 * answer 503 for a minute to everybody who had deployed a register of their own. The per-caller
 * count is what stops one of them; the instance ceiling is what keeps the site inside Studio's
 * budget when many callers each spend their own.
 */
export const LOOKUPS_PER_CALLER = 3;
export const LOOKUPS_PER_MINUTE = 8;

/**
 * Listing reads the public routes (the embed card, the badge, the listing JSON) may start in a
 * minute: per caller, and for the whole instance.
 *
 * Other sites' visitors call these, with no wallet and no signature, and one read is up to two
 * view calls (the listing and its seller's record) out of the same 30 gen_call a minute the
 * delivery routes need. Every answer is reused for a minute (lib/public-listing.ts), so honest
 * traffic, even a page with several cards on it, reads rarely; what these ceilings stop is a loop
 * over made-up listing ids, each of which would otherwise be a fresh read.
 */
export const PUBLIC_READS_PER_CALLER = 6;
export const PUBLIC_READS_PER_MINUTE = 10;

/**
 * How old the register's listing count may be before an id above it has the count read again
 * (lib/public-listing.ts). An id above the count is answered "no such listing" from the count,
 * with no read and nothing taken from the budgets above, so a loop over made-up ids costs one
 * stats() call per this long at most, however many ids it asks for. Short, so a listing made a
 * moment ago is found within seconds.
 */
export const LISTING_COUNT_RECHECK_MS = 10_000;

/** How many callers one server instance keeps a count for; past that the oldest is dropped. */
export const MAX_CALLERS = 2000;

export const TOO_MANY_READS = "too many pack requests from this address in the last minute; try again shortly";
export const TOO_MANY_CHECKS = "too many delivery checks from this address in the last minute; try again shortly";
export const TOO_MANY_LOOKUPS = "the site checked many new registers in the last minute; try again in a minute";
export const TOO_MANY_PUBLIC_READS = "this site read many listings for other sites in the last minute; try again in a minute";

/** The key a budget is kept under when no header names the caller. */
export const SHARED_CALLER = "all";

/**
 * The caller a budget is kept for.
 *
 * Only a header the host itself writes can be trusted. x-vercel-forwarded-for and x-real-ip are
 * set by the proxy and overwrite whatever the caller sent. x-forwarded-for is a list the caller
 * can start: each proxy APPENDS the address it saw, so the entry the nearest proxy added is the
 * LAST one, and the first is whatever the caller wrote. Reading the first entry made the budget
 * a formality, because one header per request reset it.
 *
 * SHARED_CALLER when nothing identifies the caller, which is one bucket for the whole deployment.
 * The routes that have a verified signer key their budget on that address instead, so the shared
 * bucket only ever limits requests nobody has signed.
 */
export function callerOf(req: { headers: { get(name: string): string | null } }): string {
  const direct = (req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || "").trim();
  if (direct) return direct.slice(0, 64);
  const parts = (req.headers.get("x-forwarded-for") || "").split(",");
  const nearest = (parts[parts.length - 1] || "").trim();
  return nearest.slice(0, 64) || SHARED_CALLER;
}

/**
 * One minute's worth of stamps for `caller`, and whether another one fits under `limit`.
 * The map is bounded: past MAX_CALLERS the oldest key is dropped, so it cannot grow without end.
 */
function takeFrom(times: Map<string, number[]>, caller: string, limit: number, now: number): boolean {
  const recent = (times.get(caller) ?? []).filter((t) => now - t < 60_000);
  times.delete(caller);
  if (recent.length >= limit) {
    times.set(caller, recent);
    return false;
  }
  recent.push(now);
  while (times.size >= MAX_CALLERS) {
    const oldest = times.keys().next().value;
    if (oldest === undefined) break;
    times.delete(oldest);
  }
  times.set(caller, recent);
  return true;
}

const readTimes = new Map<string, number[]>();
const checkTimes = new Map<string, number[]>();
const lookupTimes = new Map<string, number[]>();
let instanceLookups: number[] = [];
const publicTimes = new Map<string, number[]>();
let instancePublicReads: number[] = [];

/**
 * True when this caller may spend another chain read here, and counts it.
 *
 * Signing a read message is free and local, so the 401 gate alone does not stop anybody sending
 * pack requests in a loop with a key of their own; each one costs the server gen_call out of
 * Studio's 30 a minute, and once Studio rate-limits, every later server read waits out the
 * cooldown. Ten a minute is far above anything an honest buyer or seller does, and it caps what
 * one caller can take from everybody else at one bucketful.
 */
export function takeChainRead(caller: string, now: number = Date.now()): boolean {
  return takeFrom(readTimes, caller, READS_PER_MINUTE, now);
}

/** True when this caller may make one more delivery check here, and counts it. */
export function takeDeliveryCheck(caller: string, now: number = Date.now()): boolean {
  return takeFrom(checkTimes, caller, CHECKS_PER_MINUTE, now);
}

/** True when this caller may have one more unknown register looked up, and counts it. */
export function takeLookup(caller: string, now: number = Date.now()): boolean {
  instanceLookups = instanceLookups.filter((t) => now - t < 60_000);
  if (instanceLookups.length >= LOOKUPS_PER_MINUTE) return false;
  if (!takeFrom(lookupTimes, caller, LOOKUPS_PER_CALLER, now)) return false;
  instanceLookups.push(now);
  return true;
}

/** True when this caller may start one more public listing read here, and counts it. */
export function takePublicRead(caller: string, now: number = Date.now()): boolean {
  instancePublicReads = instancePublicReads.filter((t) => now - t < 60_000);
  if (instancePublicReads.length >= PUBLIC_READS_PER_MINUTE) return false;
  if (!takeFrom(publicTimes, caller, PUBLIC_READS_PER_CALLER, now)) return false;
  instancePublicReads.push(now);
  return true;
}

/**
 * True when `id` cannot name a listing on a register that holds `count`. The contract names its
 * listings L1, L2, … in order and never removes one, so an id above the count, or one it never
 * writes (L0, or a number with a leading zero), is "no such listing" without asking the chain.
 */
export function beyondListings(id: string, count: number): boolean {
  const m = /^L([1-9]\d*)$/.exec(id);
  return !m || Number(m[1]) > count;
}

/**
 * A bounded map of remembered answers: at most `max` keys, the oldest written dropped first, and
 * an entry the caller calls stale is forgotten on the way out rather than served.
 */
export function createBoundedMemo<T>(max: number) {
  const held = new Map<string, { value: T; at: number }>();
  return {
    remember(key: string, value: T, now: number = Date.now()): void {
      held.delete(key);
      while (held.size >= max) {
        const oldest = held.keys().next().value;
        if (oldest === undefined) break;
        held.delete(oldest);
      }
      held.set(key, { value, at: now });
    },
    recalled(key: string, stale?: (value: T, ageMs: number) => boolean, now: number = Date.now()): T | null {
      const hit = held.get(key);
      if (!hit) return null;
      if (stale && stale(hit.value, now - hit.at)) {
        held.delete(key);
        return null;
      }
      return hit.value;
    },
    size: (): number => held.size,
  };
}
