// One listing as other websites see it, read on the server: what the embed card (app/embed/[id]),
// the badge (/api/badge/[id]) and the listing JSON (/api/listing/[id]) show.
//
// Always the site's own register, the one this deployment ships with: a card on somebody's blog
// must show the same listing to every reader, and its button opens the pack page here, which
// reads that register too. Mock mode reads lib/chain-mock, as every page does.
//
// These are requested by other sites' visitors, with no wallet and nothing signed, and one read is
// up to two view calls (the listing, then its seller's record) out of Studio's 30 gen_call a
// minute, which the delivery routes need as well. So an id the register cannot hold (above its
// listing count, or one the contract never writes) is answered "no such listing" from that count,
// which is read at most once per LISTING_COUNT_RECHECK_MS and spends no budget; an answer, "no
// such listing" included, is reused for FRESH_MS by every request on this instance; requests that
// arrive while it is being read share that read; and a new read is budgeted per caller and per
// instance (lib/budget.ts). When a read cannot start (over budget, or Studio is cooling this
// instance down) or gets no answer, an answer up to KEEP_MS old stands in, marked stale with the
// time it was read; with none, the caller gets a reason and each route shows its neutral face,
// never a 500.

import { getAddress } from "viem";
import { MOCK_REGISTER } from "./api";
import { cooldownRemainingMs, RATE_LIMITED, readListing, readSeller, readStats, isMock, type Listing, type SellerRecord } from "./chain";
import {
  beyondListings,
  createBoundedMemo,
  LISTING_COUNT_RECHECK_MS,
  takePublicRead,
  TOO_MANY_PUBLIC_READS,
} from "./budget";
import { isAddress, siteRegister } from "./register";
import { isListingId } from "./store";

export type PublicListing = {
  /** the checksummed register it was read from, or "mock" */
  register: string;
  listing: Listing;
  /** null on a register deployed before seller records, or when that one read did not answer */
  seller: SellerRecord | null;
};

export type PublicRead =
  /** `data` null: the register answered and has no listing by that id */
  | { ok: true; data: PublicListing | null; readAt: number; stale: boolean }
  | { ok: false; status: 400 | 503; reason: string };

/** How long one answer is served without asking the chain again. */
export const FRESH_MS = 60_000;
/** How old an answer may be and still stand in for a read that could not be made. */
const KEEP_MS = 10 * 60_000;
/** Listings one server instance remembers; the oldest answer is dropped first. */
const MAX_REMEMBERED = 500;

export const NOT_A_LISTING_ID = "a listing id looks like L1";
export const NO_PUBLIC_REGISTER = "this site is not pointed at a register yet";
const STUDIO_BUSY = "Studio is rate-limiting this site; try again in a minute";
const NO_ANSWER = "Studio did not answer just now; try again in a minute";

type Kept = { data: PublicListing | null; at: number };
const remembered = createBoundedMemo<Kept>(MAX_REMEMBERED);
const pending = new Map<string, Promise<Kept>>();

/** The register's listing count (stats().listings) and when it was read. */
type Count = { register: string; n: number; at: number };
let lastCount: Count | null = null;
let countRead: Promise<Count | null> | null = null;

function publicRegister(): string | null {
  if (isMock) return MOCK_REGISTER;
  const site = siteRegister();
  // Studio looks contracts up by the checksummed address.
  return isAddress(site) ? getAddress(site) : null;
}

async function readFresh(id: string, register: string): Promise<Kept> {
  const chainReg = register === MOCK_REGISTER ? undefined : register;
  const l = await readListing(id, chainReg);
  if (!l.data) return { data: null, at: Date.now() };
  // The record is context: a register without seller() or a read that failed leaves it out; it never fails the listing.
  const seller = await readSeller(l.data.seller, chainReg)
    .then((r) => r.data)
    .catch(() => null);
  return { data: { register, listing: l.data, seller }, at: Date.now() };
}

/**
 * A listing count good enough to say whether `id` is above it: the one held when the id is within
 * it or it is younger than LISTING_COUNT_RECHECK_MS, otherwise a new stats() read, one at a time
 * for the whole instance. While Studio cannot be asked, an older count still stands for up to
 * FRESH_MS, like any other answer; null when there is none, and the id is then read as before.
 */
async function listingCount(register: string, id: string): Promise<Count | null> {
  const known = lastCount?.register === register ? lastCount : null;
  if (known && (!beyondListings(id, known.n) || Date.now() - known.at < LISTING_COUNT_RECHECK_MS)) return known;
  if (cooldownRemainingMs() === 0) {
    countRead ??= readStats(register === MOCK_REGISTER ? undefined : register)
      .then((r): Count => (lastCount = { register, n: r.data.listings, at: Date.now() }))
      .catch(() => null)
      .finally(() => {
        countRead = null;
      });
    const fresh = await countRead;
    if (fresh?.register === register) return fresh;
  }
  return known && Date.now() - known.at < FRESH_MS ? known : null;
}

/** Listing `id` on the site's register, for `caller` (lib/budget.ts callerOf). */
export async function readPublicListing(id: string, caller: string): Promise<PublicRead> {
  if (!isListingId(id)) return { ok: false, status: 400, reason: NOT_A_LISTING_ID };
  const register = publicRegister();
  if (!register) return { ok: false, status: 503, reason: NO_PUBLIC_REGISTER };

  const key = `${register.toLowerCase()}|${id}`;
  const now = Date.now();
  const kept = remembered.recalled(key, (k) => now - k.at > KEEP_MS);
  if (kept && now - kept.at < FRESH_MS) return { ok: true, data: kept.data, readAt: kept.at, stale: false };
  // An id the register cannot hold costs no read of its own and nothing from the budget, so a loop
  // over made-up ids cannot spend the minute every real card, badge and JSON answer needs. A
  // listing once read is never above the count, so only ids with no listing on record are checked.
  if (!kept?.data) {
    if (beyondListings(id, Number.POSITIVE_INFINITY)) return { ok: true, data: null, readAt: now, stale: false };
    const count = await listingCount(register, id);
    if (count && beyondListings(id, count.n)) return { ok: true, data: null, readAt: count.at, stale: false };
  }
  const instead = (reason: string): PublicRead =>
    kept ? { ok: true, data: kept.data, readAt: kept.at, stale: true } : { ok: false, status: 503, reason };

  let running = pending.get(key);
  if (!running) {
    // A read that would only queue behind Studio's cooldown is not started; nor is one past the budget.
    if (cooldownRemainingMs() > 0) return instead(STUDIO_BUSY);
    if (!takePublicRead(caller)) return instead(TOO_MANY_PUBLIC_READS);
    running = readFresh(id, register)
      .then((k) => {
        remembered.remember(key, k);
        return k;
      })
      .finally(() => pending.delete(key));
    pending.set(key, running);
  }
  try {
    const fresh = await running;
    return { ok: true, data: fresh.data, readAt: fresh.at, stale: false };
  } catch (e) {
    return instead(e instanceof Error && e.message === RATE_LIMITED ? STUDIO_BUSY : NO_ANSWER);
  }
}
