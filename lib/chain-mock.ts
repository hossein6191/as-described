// Mock data for NEXT_PUBLIC_MOCK=1; lib/chain.ts delegates here. Same export names as lib/chain.ts.
// It follows the contract's rules closely enough for the pages to show every state: the
// revealed sections, the verdict sentence the contract writes, and the refusals.
//
// The demo listings carry the REAL sha256 hashes of lib/demo-packs.ts, computed once with WebCrypto
// on first read, so the order page's hash check shows the same ticks it would show against the chain.

import type { LedgerRow, Listing, Order, ReadResult, Stats, TxStatus, WriteFn } from "./chain";
import { DEMO_PACKS } from "./demo-packs";

const GEN = 10n ** 18n;
const now = () => new Date().toISOString();
const plus = (iso: string, seconds: number) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

/** The contract's limits and clocks, as in contracts/as_described.py. */
const MAX_SECTION_CHARS = 4000;
const MAX_MISSING_REPORTS = 3;
const REVEAL_HOURS = 24;
const STALE_HOURS = 24;
const LISTINGS_PAGE = 25;

/** An exact amount in GEN, like the contract's _gen_text: 1200000000000000000 -> "1.2 GEN". */
const genText = (atto: bigint) => {
  const frac = (atto % GEN).toString().padStart(18, "0").replace(/0+$/, "");
  return (atto / GEN).toString() + (frac ? "." + frac : "") + " GEN";
};

/** The sentence the contract stores with a final order, from the same closed tokens. */
function verdictLineOf(o: Order, oversize = false): string {
  const s = String(o.sectionIndex + 1);
  const p = String(o.promiseIndex + 1);
  const toBuyer = BigInt(o.paidBuyer);
  const toSeller = BigInt(o.paidSeller);
  if (o.status === "settled" && o.verdict === "breaks" && oversize)
    return `Section ${s} is longer than the ${MAX_SECTION_CHARS} characters a section may have, so the dispute was settled as breaks by rule, without asking the validators: the buyer got the price and the bond back, ${genText(toBuyer)}.`;
  if (o.status === "settled" && o.verdict === "breaks")
    return `A majority of the validators found that section ${s} breaks promise ${p}, so the buyer got the price and the bond back: ${genText(toBuyer)}.`;
  if (o.status === "settled" && o.verdict === "keeps")
    return `A majority of the validators found that section ${s} keeps promise ${p}, so the seller got the price and the bond: ${genText(toSeller)}.`;
  if (o.status === "settled" && o.verdict === "unclear")
    return `The validators did not reach a clear answer on whether section ${s} breaks promise ${p}, so the seller got the price (${genText(toSeller)}) and the buyer got the bond back (${genText(toBuyer)}).`;
  if (o.status === "settled_stale")
    return `No verdict was stored within ${STALE_HOURS} hours of the dispute on section ${s} against promise ${p}, so it was settled by rule: the seller got the price (${genText(toSeller)}) and the buyer got the bond back (${genText(toBuyer)}).`;
  if (o.status === "released")
    return `The dispute window closed with no dispute, so the seller got the price: ${genText(toSeller)}.`;
  if (o.status === "refunded")
    return `Section ${o.missingIndex + 1} was reported missing and not revealed within ${REVEAL_HOURS} hours, so the buyer got the full price back: ${genText(toBuyer)}.`;
  return "";
}

const seller = "0x0a9fd8fe0b041974e8f794fcf3eed352c14cf5fe";
const buyer = "0x449ab0b80539a6358d6a78664221de0a1d96c65a";
/** The address the mock treats as "the connected wallet" for writes when none is given. */
export const MOCK_BUYER = buyer;
export const MOCK_SELLER = seller;

const fakeHash = (s: string) =>
  Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(s.charCodeAt(i % s.length) + i) % 16]).join("");

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const toAtto = (genText: string) => {
  const [w, f = ""] = genText.split(".");
  return BigInt(w) * GEN + BigInt((f + "0".repeat(18)).slice(0, 18));
};

const listings: Listing[] = DEMO_PACKS.map((p, i) => ({
  id: "L" + (i + 1),
  seller,
  title: p.title,
  kind: p.kind,
  promises: p.promises,
  hashes: p.sections.map((s, j) => fakeHash(p.title + j + s.length)),
  sectionCount: p.sections.length,
  priceAtto: toAtto(p.priceGen).toString(),
  windowSeconds: p.windowSeconds,
  createdAt: new Date(Date.UTC(2026, 8, 18, 10, i * 5)).toISOString(),
  open: true,
  orders: 0,
  kept: 0,
  broken: 0,
  unclear: 0,
}));

/** Section texts per listing (the delivery API's store, in memory). */
const packs = new Map<string, string[]>(DEMO_PACKS.map((p, i) => ["L" + (i + 1), p.sections]));

let hashesReady: Promise<void> | null = null;
function init(): Promise<void> {
  if (!hashesReady) {
    hashesReady = (async () => {
      for (const l of listings) {
        const sections = packs.get(l.id);
        if (sections) l.hashes = await Promise.all(sections.map(sha256));
      }
    })();
  }
  return hashesReady;
}

const bondOf = (priceAtto: string) => {
  const bond = (BigInt(priceAtto) * 20n) / 100n;
  return (bond < 10n ** 16n ? 10n ** 16n : bond).toString();
};

const blankOrder = (id: string, l: Listing, who: string, openedAt: string): Order => ({
  id,
  listing: l.id,
  title: l.title,
  buyer: who,
  seller: l.seller,
  priceAtto: l.priceAtto,
  openedAt,
  deadlineAt: plus(openedAt, l.windowSeconds),
  status: "paid",
  sectionIndex: -1,
  promiseIndex: -1,
  bondAtto: "0",
  disputedAt: "",
  verdict: "",
  judgedAt: "",
  revealedText: "",
  missingIndex: -1,
  missingAt: "",
  missingReportsLeft: MAX_MISSING_REPORTS,
  paidBuyer: "0",
  paidSeller: "0",
  windowOpen: true,
  bondRequiredAtto: bondOf(l.priceAtto),
  revealed: [],
  verdictLine: "",
  chainNow: "",
  readAtMs: 0,
});

const orders: Order[] = [];
{
  // O1: pack 1, recipe 5 vs P1 → breaks → refund
  const o1 = blankOrder("O1", listings[0], buyer, "2026-09-18T11:00:00.000Z");
  Object.assign(o1, {
    status: "settled",
    sectionIndex: 4,
    promiseIndex: 0,
    // the bond is paid out with the price at settlement, so the row's bond is 0 from then on
    bondAtto: "0",
    disputedAt: "2026-09-18T11:10:00.000Z",
    verdict: "breaks",
    judgedAt: "2026-09-18T11:12:00.000Z",
    revealedText: DEMO_PACKS[0].sections[4],
    paidBuyer: (BigInt(o1.priceAtto) + BigInt(bondOf(o1.priceAtto))).toString(),
    windowOpen: false,
  });
  // O2: pack 2, recipe 3 vs P2 → keeps → seller paid
  const o2 = blankOrder("O2", listings[1], buyer, "2026-09-18T11:20:00.000Z");
  Object.assign(o2, {
    status: "settled",
    sectionIndex: 2,
    promiseIndex: 1,
    bondAtto: "0",
    disputedAt: "2026-09-18T11:25:00.000Z",
    verdict: "keeps",
    judgedAt: "2026-09-18T11:27:00.000Z",
    revealedText: DEMO_PACKS[1].sections[2],
    paidSeller: (BigInt(o2.priceAtto) + BigInt(bondOf(o2.priceAtto))).toString(),
    windowOpen: false,
  });
  // O3: pack 1, fresh, in escrow (the page you dispute on)
  const o3 = blankOrder("O3", listings[0], buyer, now());
  // O4: pack 3, released after the 5-minute window
  const o4 = blankOrder("O4", listings[2], buyer, "2026-09-18T12:00:00.000Z");
  Object.assign(o4, { status: "released", paidSeller: o4.priceAtto, windowOpen: false });
  // O5: pack 2, a second buyer, report_missing → seller revealed → back in escrow
  const o5 = blankOrder("O5", listings[1], "0x7d1f2b9c4e6a8d0b1c3e5f7a9b2d4f6e8a0c1b3d", "2026-09-18T12:30:00.000Z");
  Object.assign(o5, {
    revealedText: DEMO_PACKS[1].sections[6],
    missingIndex: 6,
    missingAt: "2026-09-18T12:40:00.000Z",
    revealed: [{ index: 6, text: DEMO_PACKS[1].sections[6] }],
    missingReportsLeft: MAX_MISSING_REPORTS - 1,
  });
  for (const o of [o1, o2, o4]) o.verdictLine = verdictLineOf(o);
  orders.push(o1, o2, o3, o4, o5);
  listings[0].orders = 2;
  listings[0].broken = 1;
  listings[1].orders = 2;
  listings[1].kept = 1;
  listings[2].orders = 1;
}

const balances = new Map<string, bigint>([
  [buyer, 12n * GEN],
  [seller, 30n * GEN],
]);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chain = <T,>(data: T): ReadResult<T> => ({ data, source: "chain" });

const refreshWindow = (o: Order) => {
  o.windowOpen = o.status === "paid" && new Date(o.deadlineAt).getTime() > Date.now();
  return o;
};

export async function readListingIds(): Promise<ReadResult<string[]>> {
  await init();
  await delay(120);
  return chain(listings.map((l) => l.id));
}
const copyListing = (l: Listing): Listing => ({ ...l, promises: [...l.promises], hashes: [...l.hashes] });

export async function readListing(id: string): Promise<ReadResult<Listing | null>> {
  await init();
  await delay(120);
  const l = listings.find((x) => x.id === id);
  return chain(l ? copyListing(l) : null);
}
export async function readListings(
  offset: number,
  limit: number,
): Promise<ReadResult<{ total: number; rows: Listing[] }>> {
  await init();
  await delay(120);
  const start = Math.max(0, Math.trunc(offset) || 0);
  const size = Math.max(1, Math.min(LISTINGS_PAGE, Math.trunc(limit) || LISTINGS_PAGE));
  return chain({ total: listings.length, rows: listings.slice(start, start + size).map(copyListing) });
}
export async function readAllListings(): Promise<ReadResult<Listing[]>> {
  await init();
  await delay(150);
  return chain(listings.map(copyListing));
}
/** The order as the view shows it now, with the view's own clock (the mock's clock is the chain's). Never cached. */
export async function readOrder(id: string): Promise<ReadResult<Order | null>> {
  await init();
  await delay(120);
  const o = orders.find((x) => x.id === id);
  if (!o) return chain(null);
  refreshWindow(o);
  return chain({ ...o, revealed: o.revealed.map((r) => ({ ...r })), chainNow: now(), readAtMs: Date.now() });
}
export async function readOrdersOf(listing: string): Promise<ReadResult<string[]>> {
  await delay(80);
  return chain(orders.filter((o) => o.listing === listing).map((o) => o.id));
}
export async function readOrdersOfBuyer(address: string): Promise<ReadResult<string[]>> {
  await delay(80);
  return chain(orders.filter((o) => o.buyer === address.toLowerCase()).map((o) => o.id));
}
export async function readLedger(count: number): Promise<ReadResult<LedgerRow[]>> {
  await delay(150);
  return chain(
    orders
      .slice(-count)
      .reverse()
      .map((o) => ({ ...refreshWindow(o) })),
  );
}
export async function readStats(): Promise<ReadResult<Stats>> {
  await delay(80);
  return chain({
    listings: listings.length,
    orders: orders.length,
    kept: orders.filter((o) => o.verdict === "keeps").length,
    broken: orders.filter((o) => o.verdict === "breaks").length,
    unclear: orders.filter((o) => o.verdict === "unclear").length,
    refunded: orders.filter((o) => o.status === "refunded").length,
    released: orders.filter((o) => o.status === "released").length,
    stale: orders.filter((o) => o.status === "settled_stale").length,
  });
}
export async function readBondFor(listing: string): Promise<string> {
  const l = listings.find((x) => x.id === listing);
  return l ? bondOf(l.priceAtto) : "0";
}

// ---- the delivery API, in memory (the order page uses these when isMock) ----
export function mockPackSections(listingId: string): string[] | null {
  return packs.get(listingId) ?? null;
}
export function mockStorePack(listingId: string, sections: string[]) {
  packs.set(listingId, sections);
}
export function mockPackUploaded(listingId: string): boolean {
  return packs.has(listingId);
}

// ---- writes: a fake hash whose status advances on every poll, with a plausible state change ----
// Two kinds of refusal, as on chain: a payable call returns {ok:false, reason} and refunds what
// it took, anything else raises and the receipt carries the [EXPECTED] sentence.
const pending = new Map<
  string,
  { fn: WriteFn; args: string[]; polls: number; result: Record<string, unknown>; error: string }
>();

const credit = (who: string, atto: bigint) => balances.set(who, (balances.get(who) ?? 0n) + atto);

class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};

export async function write(fn: WriteFn, args: string[], valueAtto?: bigint): Promise<string> {
  await init();
  await delay(300);
  const hash = "0x" + fakeHash(fn + args.join("|") + String(valueAtto ?? 0n) + Date.now());
  let result: Record<string, unknown> = { ok: true };
  let error = "";
  const find = (id: string) => orders.find((x) => x.id === id);
  const listingOf = (o: Order) => listings.find((x) => x.id === o.listing);
  const settle = (o: Order, toBuyer: bigint, toSeller: bigint, status: Order["status"], oversize = false) => {
    if (toBuyer > 0n) credit(o.buyer, toBuyer);
    if (toSeller > 0n) credit(o.seller, toSeller);
    o.paidBuyer = toBuyer.toString();
    o.paidSeller = toSeller.toString();
    o.bondAtto = "0";
    o.status = status;
    o.windowOpen = false;
    o.verdictLine = verdictLineOf(o, oversize);
  };

  try {
  if (fn === "buy") {
    const l = listings.find((x) => x.id === args[0]);
    if (!l) result = { ok: false, reason: "No such listing." };
    else if (!l.open) result = { ok: false, reason: "This listing is closed." };
    else if ((valueAtto ?? 0n) !== BigInt(l.priceAtto)) result = { ok: false, reason: "Send exactly the price. Your GEN was refunded." };
    else {
      const id = "O" + (orders.length + 1);
      const o = blankOrder(id, l, buyer, now());
      orders.push(o);
      l.orders += 1;
      result = { ok: true, order: id, deadline_at: o.deadlineAt };
    }
  } else if (fn === "close_listing") {
    const l = listings.find((x) => x.id === args[0]);
    if (l) {
      l.open = false;
      result = { ok: true, listing: l.id, open: false };
    }
  } else if (fn === "open_dispute") {
    const o = find(args[0]);
    if (!o) result = { ok: false, reason: "No such order." };
    else if (o.status !== "paid") result = { ok: false, reason: "This order is not in escrow." };
    else if ((valueAtto ?? 0n) !== BigInt(o.bondRequiredAtto)) result = { ok: false, reason: "Post exactly the bond. Your GEN was refunded." };
    else {
      o.status = "disputed";
      o.sectionIndex = Number(args[1]);
      o.promiseIndex = Number(args[2]);
      o.bondAtto = o.bondRequiredAtto;
      o.disputedAt = now();
      result = { ok: true, order: o.id, status: "disputed" };
    }
  } else if (fn === "judge") {
    const o = find(args[0]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "disputed") {
      if (o.verdict) refuse("this order was already judged: the verdict is " + o.verdict);
      refuse("nothing to judge: the order is " + o.status);
    } else {
      const text = args[1];
      const l = listingOf(o);
      const committed = l?.hashes[o.sectionIndex] ?? "";
      if (committed && (await sha256(text)) !== committed) {
        refuse("the text does not match the hash the seller committed for section " + (o.sectionIndex + 1));
      }
      // A committed section longer than the cap breaks the published rule on its own: the
      // contract settles it as breaks without asking the validators.
      const oversize = text.length > MAX_SECTION_CHARS;
      const breaks = oversize || /bacon|chicken|beef|pork|fish|prawn|oven|bake|\[[A-Z]+\]/i.test(text);
      o.verdict = breaks ? "breaks" : "keeps";
      o.judgedAt = now();
      o.revealedText = text;
      const total = BigInt(o.priceAtto) + BigInt(o.bondAtto);
      if (breaks) settle(o, total, 0n, "settled", oversize);
      else settle(o, 0n, total, "settled");
      if (l) {
        if (breaks) l.broken += 1;
        else l.kept += 1;
      }
      result = { ok: true, order: o.id, verdict: o.verdict, by_rule: oversize, status: "settled",
        to_buyer: o.paidBuyer, to_seller: o.paidSeller, verdict_line: o.verdictLine };
    }
  } else if (fn === "release") {
    const o = find(args[0]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "paid") refuse("only a paid order is released; this one is " + o.status);
    else if (new Date(o.deadlineAt).getTime() > Date.now()) {
      refuse("the dispute window is open until " + o.deadlineAt);
    } else {
      settle(o, 0n, BigInt(o.priceAtto), "released");
      result = { ok: true, order: o.id, status: "released", to_seller: o.paidSeller, verdict_line: o.verdictLine };
    }
  } else if (fn === "report_missing") {
    const o = find(args[0]);
    const section = Number(args[1]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "paid") refuse("only a paid order can report a missing section; this one is " + o.status);
    else if (o.revealed.some((r) => r.index === section)) {
      refuse("section " + (section + 1) + " is already on chain; read it from the order");
    } else if ((o.missingReportsLeft ?? MAX_MISSING_REPORTS) <= 0) {
      refuse("a buyer reports at most " + MAX_MISSING_REPORTS + " sections missing per order; a pack that did not arrive ends in a refund");
    } else {
      o.status = "missing";
      o.missingIndex = section;
      o.missingAt = now();
      o.missingReportsLeft = (o.missingReportsLeft ?? MAX_MISSING_REPORTS) - 1;
      result = { ok: true, order: o.id, status: "missing", missing_index: section, reports_left: o.missingReportsLeft, reveal_hours: REVEAL_HOURS };
    }
  } else if (fn === "withdraw_dispute") {
    const o = find(args[0]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "disputed") refuse("only a disputed order can be withdrawn; this one is " + o.status);
    else {
      const bond = BigInt(o.bondAtto);
      o.status = "paid";
      o.bondAtto = "0";
      o.disputedAt = "";
      result = { ok: true, order: o.id, status: "paid", to_buyer: String(bond), deadline_at: o.deadlineAt };
    }
  } else if (fn === "reveal") {
    const o = find(args[0]);
    const text = args[1];
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "missing") refuse("nothing to reveal: the order is " + o.status);
    else if (text.length > MAX_SECTION_CHARS) refuse("a section is at most " + MAX_SECTION_CHARS + " characters");
    else if ((listingOf(o)?.hashes[o.missingIndex] ?? "") !== (await sha256(text))) {
      refuse("the text does not match the hash the seller committed for section " + (o.missingIndex + 1));
    } else {
      o.status = "paid";
      o.revealedText = text;
      o.revealed = [...o.revealed.filter((r) => r.index !== o.missingIndex), { index: o.missingIndex, text }]
        .sort((a, b) => a.index - b.index);
      const floor = plus(now(), REVEAL_HOURS * 3600);
      if (new Date(floor).getTime() > new Date(o.deadlineAt).getTime()) o.deadlineAt = floor;
      result = { ok: true, order: o.id, status: "paid", section_index: o.missingIndex, deadline_at: o.deadlineAt };
    }
  } else if (fn === "refund_missing") {
    const o = find(args[0]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "missing") refuse("nothing to refund: the order is " + o.status);
    else {
      settle(o, BigInt(o.priceAtto), 0n, "refunded");
      result = { ok: true, order: o.id, status: "refunded", to_buyer: o.paidBuyer, verdict_line: o.verdictLine };
    }
  } else if (fn === "settle_stale") {
    const o = find(args[0]);
    if (!o) refuse("no order named " + args[0]);
    else if (o.status !== "disputed") refuse("nothing stale to settle: the order is " + o.status);
    else {
      settle(o, BigInt(o.bondAtto), BigInt(o.priceAtto), "settled_stale");
      result = { ok: true, order: o.id, status: "settled_stale", to_buyer: o.paidBuyer, to_seller: o.paidSeller,
        verdict_line: o.verdictLine };
    }
  } else if (fn === "list_pack") {
    const promises: string[] = JSON.parse(args[2]);
    if (promises.some((p) => /[\r\n]/.test(p))) refuse("each promise is one line, with no line breaks");
    const hashes: string[] = JSON.parse(args[3]);
    const id = "L" + (listings.length + 1);
    listings.push({
      id,
      seller: buyer,
      title: args[0],
      kind: args[1],
      promises,
      hashes,
      sectionCount: hashes.length,
      priceAtto: args[4],
      windowSeconds: Number(args[5]),
      createdAt: now(),
      open: true,
      orders: 0,
      kept: 0,
      broken: 0,
      unclear: 0,
    });
    result = { ok: true, listing: id };
  }
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // A raised refusal changes nothing and leaves its sentence in the receipt.
    error = e.message;
    result = {};
  }
  pending.set(hash, { fn, args, polls: 0, result, error });
  return hash;
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(100);
  const p = pending.get(hash);
  if (!p)
    return {
      status: "UNKNOWN",
      votes: { agree: 0, disagree: 0, idle: 0 },
      applied: null,
      undetermined: false,
      exec: null,
      result: null,
      message: "",
    };
  p.polls += 1;
  const stage = STAGES[Math.min(p.polls - 1, STAGES.length - 1)];
  const judged = p.fn === "judge";
  const done = p.polls >= STAGES.length;
  // Studio assigns five validators and one or two are usually idle in a round; the mock
  // shows the same shape, so the tiles and the legend are not a surprise on the real chain.
  const agree = judged ? Math.min(p.polls, 3) : done ? 4 : 0;
  return {
    status: stage,
    votes: { agree, disagree: 0, idle: 5 - agree },
    applied: done ? true : null,
    undetermined: false,
    // A raised refusal is an ERROR receipt; a payable refusal succeeds and returns ok:false.
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}
export async function balanceOf(address: string): Promise<bigint> {
  await delay(50);
  return balances.get(address.toLowerCase()) ?? 12n * GEN;
}
export async function faucet(address: string): Promise<bigint> {
  await delay(600);
  credit(address.toLowerCase(), 10n * GEN);
  return balances.get(address.toLowerCase()) ?? 10n * GEN;
}

/** Everything a snapshot file needs (tools use this to write data/snapshot.json). */
export async function snapshotData() {
  await init();
  return {
    takenAt: now(),
    network: "GenLayer Studio, chain 61999",
    listings: listings.map((l) => ({ ...l })),
    orders: orders.map((o) => ({ ...refreshWindow(o) })),
    stats: (await readStats()).data,
  };
}
