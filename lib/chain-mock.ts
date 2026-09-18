// In-memory stand-in for the contract, used when NEXT_PUBLIC_MOCK=1.
// Owned by the ui agent (extend the data freely); lib/chain.ts delegates here. Same export names as lib/chain.ts.
//
// The three demo listings carry the REAL sha256 hashes of lib/demo-packs.ts, computed once with WebCrypto
// on first read, so the order page's hash check shows the same ticks it would show against the chain.

import type { LedgerRow, Listing, Order, ReadResult, Stats, TxStatus, WriteFn } from "./chain";
import { DEMO_PACKS } from "./demo-packs";

const GEN = 10n ** 18n;
const now = () => new Date().toISOString();
const plus = (iso: string, seconds: number) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

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
  createdAt: `2026-09-18T10:0${i * 5}:00.000Z`.replace("10:015", "10:15"),
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
  paidBuyer: "0",
  paidSeller: "0",
  windowOpen: true,
  bondRequiredAtto: bondOf(l.priceAtto),
});

const orders: Order[] = [];
{
  // O1: pack 1, recipe 5 vs P1 → breaks → refund
  const o1 = blankOrder("O1", listings[0], buyer, "2026-09-18T11:00:00.000Z");
  Object.assign(o1, {
    status: "settled",
    sectionIndex: 4,
    promiseIndex: 0,
    bondAtto: bondOf(o1.priceAtto),
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
    bondAtto: bondOf(o2.priceAtto),
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
  Object.assign(o5, { revealedText: DEMO_PACKS[1].sections[6], missingIndex: 6, missingAt: "2026-09-18T12:40:00.000Z" });
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
export async function readListing(id: string): Promise<ReadResult<Listing | null>> {
  await init();
  await delay(120);
  const l = listings.find((x) => x.id === id);
  return chain(l ? { ...l, promises: [...l.promises], hashes: [...l.hashes] } : null);
}
export async function readOrder(id: string): Promise<ReadResult<Order | null>> {
  await init();
  await delay(120);
  const o = orders.find((x) => x.id === id);
  return chain(o ? { ...refreshWindow(o) } : null);
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
const pending = new Map<string, { fn: WriteFn; args: string[]; polls: number; result: Record<string, unknown> }>();

const credit = (who: string, atto: bigint) => balances.set(who, (balances.get(who) ?? 0n) + atto);

export async function write(fn: WriteFn, args: string[], valueAtto?: bigint): Promise<string> {
  await init();
  await delay(300);
  const hash = "0x" + fakeHash(fn + args.join("|") + String(valueAtto ?? 0n) + Date.now());
  let result: Record<string, unknown> = { ok: true };
  const find = (id: string) => orders.find((x) => x.id === id);
  const listingOf = (o: Order) => listings.find((x) => x.id === o.listing);

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
    if (o && o.status === "disputed") {
      const text = args[1];
      const breaks = /bacon|chicken|beef|pork|fish|prawn|oven|bake|\[[A-Z]+\]/i.test(text);
      o.verdict = breaks ? "breaks" : "keeps";
      o.status = "settled";
      o.judgedAt = now();
      o.revealedText = text;
      const total = BigInt(o.priceAtto) + BigInt(o.bondAtto);
      if (breaks) {
        o.paidBuyer = total.toString();
        credit(o.buyer, total);
      } else {
        o.paidSeller = total.toString();
        credit(o.seller, total);
      }
      const l = listingOf(o);
      if (l) {
        if (breaks) l.broken += 1;
        else l.kept += 1;
      }
      result = { ok: true, order: o.id, verdict: o.verdict, status: "settled" };
    }
  } else if (fn === "release") {
    const o = find(args[0]);
    if (o && o.status === "paid") {
      o.status = "released";
      o.paidSeller = o.priceAtto;
      credit(o.seller, BigInt(o.priceAtto));
      result = { ok: true, order: o.id, status: "released" };
    }
  } else if (fn === "report_missing") {
    const o = find(args[0]);
    if (o && o.status === "paid") {
      o.status = "missing";
      o.missingIndex = Number(args[1]);
      o.missingAt = now();
      result = { ok: true, order: o.id, status: "missing" };
    }
  } else if (fn === "reveal") {
    const o = find(args[0]);
    if (o && o.status === "missing") {
      o.status = "paid";
      o.revealedText = args[1];
      const floor = plus(now(), 24 * 3600);
      if (new Date(floor).getTime() > new Date(o.deadlineAt).getTime()) o.deadlineAt = floor;
      result = { ok: true, order: o.id, status: "paid", deadline_at: o.deadlineAt };
    }
  } else if (fn === "refund_missing") {
    const o = find(args[0]);
    if (o && o.status === "missing") {
      o.status = "refunded";
      o.paidBuyer = o.priceAtto;
      credit(o.buyer, BigInt(o.priceAtto));
      result = { ok: true, order: o.id, status: "refunded" };
    }
  } else if (fn === "settle_stale") {
    const o = find(args[0]);
    if (o && o.status === "disputed") {
      o.status = "settled_stale";
      o.paidSeller = o.priceAtto;
      o.paidBuyer = o.bondAtto;
      credit(o.seller, BigInt(o.priceAtto));
      credit(o.buyer, BigInt(o.bondAtto));
      result = { ok: true, order: o.id, status: "settled_stale" };
    }
  } else if (fn === "list_pack") {
    const hashes: string[] = JSON.parse(args[3]);
    const id = "L" + (listings.length + 1);
    listings.push({
      id,
      seller: buyer,
      title: args[0],
      kind: args[1],
      promises: JSON.parse(args[2]),
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
  pending.set(hash, { fn, args, polls: 0, result });
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
  const agree = judged ? Math.min(p.polls, 5) : done ? 5 : 0;
  return {
    status: stage,
    votes: { agree, disagree: 0, idle: 5 - agree },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.result.ok === false ? "ERROR" : "SUCCESS") : null,
    result: done ? p.result : null,
    message: done ? JSON.stringify(p.result) : "",
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
