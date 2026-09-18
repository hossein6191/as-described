// In-memory stand-in for the contract, used when NEXT_PUBLIC_MOCK=1.
// Owned by the ui agent (extend the data freely); lib/chain.ts delegates here. Same export names as lib/chain.ts.

import type {
  LedgerRow,
  Listing,
  Order,
  ReadResult,
  Stats,
  TxStatus,
  WriteFn,
} from "./chain";

const GEN = 10n ** 18n;
const now = () => new Date().toISOString();
const plus = (iso: string, seconds: number) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

const seller = "0x0a9fd8fe0b041974e8f794fcf3eed352c14cf5fe";
const buyer = "0x449ab0b80539a6358d6a78664221de0a1d96c65a";

const fakeHash = (s: string) =>
  Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(s.charCodeAt(i % s.length) + i) % 16]).join("");

const listings: Listing[] = [
  {
    id: "L1",
    seller,
    title: "Weeknight Vegetarian, 8 recipes",
    kind: "recipes",
    promises: [
      "Every recipe is vegetarian: no meat, poultry or fish.",
      "Every recipe states a total time, and it is 30 minutes or less.",
      "No recipe needs an oven.",
    ],
    hashes: Array.from({ length: 8 }, (_, i) => fakeHash("veg" + i)),
    sectionCount: 8,
    priceAtto: (1n * GEN).toString(),
    windowSeconds: 3 * 86400,
    createdAt: "2026-09-18T10:00:00.000Z",
    open: true,
    orders: 2,
    kept: 0,
    broken: 1,
    unclear: 0,
  },
  {
    id: "L2",
    seller,
    title: "Weeknight Vegetarian, 8 recipes — the honest twin",
    kind: "recipes",
    promises: [
      "Every recipe is vegetarian: no meat, poultry or fish.",
      "Every recipe states a total time, and it is 30 minutes or less.",
      "No recipe needs an oven.",
    ],
    hashes: Array.from({ length: 8 }, (_, i) => fakeHash("honest" + i)),
    sectionCount: 8,
    priceAtto: (1n * GEN).toString(),
    windowSeconds: 3 * 86400,
    createdAt: "2026-09-18T10:05:00.000Z",
    open: true,
    orders: 1,
    kept: 1,
    broken: 0,
    unclear: 0,
  },
  {
    id: "L3",
    seller,
    title: "Cold Email Templates, 6 templates",
    kind: "templates",
    promises: [
      "Every template has a subject line.",
      "Every template is under 120 words.",
      "No template leaves a placeholder like [NAME] unfilled.",
    ],
    hashes: Array.from({ length: 6 }, (_, i) => fakeHash("mail" + i)),
    sectionCount: 6,
    priceAtto: (5n * GEN / 10n).toString(),
    windowSeconds: 300,
    createdAt: "2026-09-18T10:10:00.000Z",
    open: true,
    orders: 1,
    kept: 0,
    broken: 0,
    unclear: 0,
  },
];

const orders: Order[] = [
  {
    id: "O1",
    listing: "L1",
    title: listings[0].title,
    buyer,
    seller,
    priceAtto: (1n * GEN).toString(),
    openedAt: "2026-09-18T11:00:00.000Z",
    deadlineAt: plus("2026-09-18T11:00:00.000Z", 3 * 86400),
    status: "settled",
    sectionIndex: 4,
    promiseIndex: 0,
    bondAtto: (2n * GEN / 10n).toString(),
    disputedAt: "2026-09-18T11:10:00.000Z",
    verdict: "breaks",
    judgedAt: "2026-09-18T11:12:00.000Z",
    revealedText: "Recipe 5 — Carbonara-style pasta (25 min)\n\nFry 100 g bacon until crisp…",
    missingIndex: -1,
    missingAt: "",
    paidBuyer: (12n * GEN / 10n).toString(),
    paidSeller: "0",
    windowOpen: false,
    bondRequiredAtto: (2n * GEN / 10n).toString(),
  },
  {
    id: "O2",
    listing: "L2",
    title: listings[1].title,
    buyer,
    seller,
    priceAtto: (1n * GEN).toString(),
    openedAt: "2026-09-18T11:20:00.000Z",
    deadlineAt: plus("2026-09-18T11:20:00.000Z", 3 * 86400),
    status: "settled",
    sectionIndex: 2,
    promiseIndex: 1,
    bondAtto: (2n * GEN / 10n).toString(),
    disputedAt: "2026-09-18T11:25:00.000Z",
    verdict: "keeps",
    judgedAt: "2026-09-18T11:27:00.000Z",
    revealedText: "Recipe 3 — Chickpea and spinach curry (25 min)…",
    missingIndex: -1,
    missingAt: "",
    paidBuyer: "0",
    paidSeller: (12n * GEN / 10n).toString(),
    windowOpen: false,
    bondRequiredAtto: (2n * GEN / 10n).toString(),
  },
  {
    id: "O3",
    listing: "L1",
    title: listings[0].title,
    buyer,
    seller,
    priceAtto: (1n * GEN).toString(),
    openedAt: now(),
    deadlineAt: plus(now(), 3 * 86400),
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
    bondRequiredAtto: (2n * GEN / 10n).toString(),
  },
  {
    id: "O4",
    listing: "L3",
    title: listings[2].title,
    buyer,
    seller,
    priceAtto: (5n * GEN / 10n).toString(),
    openedAt: "2026-09-18T12:00:00.000Z",
    deadlineAt: "2026-09-18T12:05:00.000Z",
    status: "released",
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
    paidSeller: (5n * GEN / 10n).toString(),
    windowOpen: false,
    bondRequiredAtto: (1n * GEN / 10n).toString(),
  },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chain = <T,>(data: T): ReadResult<T> => ({ data, source: "chain" });

export async function readListingIds(): Promise<ReadResult<string[]>> {
  await delay(120);
  return chain(listings.map((l) => l.id));
}
export async function readListing(id: string): Promise<ReadResult<Listing | null>> {
  await delay(120);
  return chain(listings.find((l) => l.id === id) ?? null);
}
export async function readOrder(id: string): Promise<ReadResult<Order | null>> {
  await delay(120);
  return chain(orders.find((o) => o.id === id) ?? null);
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
  return chain(orders.slice(-count).reverse().map((o) => ({ ...o })));
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
  if (!l) return "0";
  const price = BigInt(l.priceAtto);
  const bond = price * 20n / 100n;
  return (bond < 10n ** 16n ? 10n ** 16n : bond).toString();
}

// A mock write: returns a fake hash whose status advances on every poll and applies a plausible state change.
const pending = new Map<string, { fn: WriteFn; args: string[]; polls: number; result: Record<string, unknown> }>();

export async function write(fn: WriteFn, args: string[], valueAtto?: bigint): Promise<string> {
  await delay(300);
  const hash = "0x" + fakeHash(fn + args.join("|") + String(valueAtto ?? 0n) + Date.now());
  let result: Record<string, unknown> = { ok: true };
  if (fn === "buy") {
    const l = listings.find((x) => x.id === args[0]);
    if (l) {
      const id = "O" + (orders.length + 1);
      const openedAt = now();
      orders.push({
        id, listing: l.id, title: l.title, buyer, seller: l.seller, priceAtto: l.priceAtto, openedAt,
        deadlineAt: plus(openedAt, l.windowSeconds), status: "paid", sectionIndex: -1, promiseIndex: -1,
        bondAtto: "0", disputedAt: "", verdict: "", judgedAt: "", revealedText: "", missingIndex: -1, missingAt: "",
        paidBuyer: "0", paidSeller: "0", windowOpen: true, bondRequiredAtto: await readBondFor(l.id),
      });
      l.orders += 1;
      result = { ok: true, order: id, deadline_at: plus(openedAt, l.windowSeconds) };
    }
  } else if (fn === "open_dispute") {
    const o = orders.find((x) => x.id === args[0]);
    if (o) {
      o.status = "disputed"; o.sectionIndex = Number(args[1]); o.promiseIndex = Number(args[2]);
      o.bondAtto = o.bondRequiredAtto; o.disputedAt = now();
      result = { ok: true, order: o.id, status: "disputed" };
    }
  } else if (fn === "judge") {
    const o = orders.find((x) => x.id === args[0]);
    if (o) {
      const breaks = /bacon|chicken|beef|fish|oven|bake/i.test(args[1]);
      o.verdict = breaks ? "breaks" : "keeps"; o.status = "settled"; o.judgedAt = now(); o.revealedText = args[1];
      const total = BigInt(o.priceAtto) + BigInt(o.bondAtto);
      if (breaks) o.paidBuyer = total.toString(); else o.paidSeller = total.toString();
      const l = listings.find((x) => x.id === o.listing);
      if (l) { if (breaks) l.broken += 1; else l.kept += 1; }
      result = { ok: true, order: o.id, verdict: o.verdict, status: "settled" };
    }
  } else if (fn === "release") {
    const o = orders.find((x) => x.id === args[0]);
    if (o) { o.status = "released"; o.paidSeller = o.priceAtto; result = { ok: true, order: o.id, status: "released" }; }
  } else if (fn === "list_pack") {
    const id = "L" + (listings.length + 1);
    listings.push({
      id, seller: buyer, title: args[0], kind: args[1], promises: JSON.parse(args[2]), hashes: JSON.parse(args[3]),
      sectionCount: JSON.parse(args[3]).length, priceAtto: args[4], windowSeconds: Number(args[5]), createdAt: now(),
      open: true, orders: 0, kept: 0, broken: 0, unclear: 0,
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
  if (!p) return { status: "UNKNOWN", votes: { agree: 0, disagree: 0, idle: 0 }, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  const stage = STAGES[Math.min(p.polls - 1, STAGES.length - 1)];
  const judged = p.fn === "judge";
  const done = p.polls >= 4;
  return {
    status: stage,
    votes: judged ? { agree: done ? 3 : Math.min(p.polls, 3), disagree: 0, idle: done ? 2 : 5 - Math.min(p.polls, 3) } : { agree: done ? 5 : 0, disagree: 0, idle: done ? 0 : 5 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? "SUCCESS" : null,
    result: done ? p.result : null,
    message: done ? JSON.stringify(p.result) : "",
  };
}
export async function balanceOf(address: string): Promise<bigint> {
  void address;
  await delay(50);
  return 12n * GEN;
}
export async function faucet(address: string): Promise<bigint> {
  void address;
  await delay(600);
  return 22n * GEN;
}
