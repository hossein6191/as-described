// Chain access for As Described: the ONE interface every page codes against.
// Real implementation: genlayer-js 1.1.8 against GenLayer Studio (chain 61999).
// Mock implementation (NEXT_PUBLIC_MOCK=1): lib/chain-mock.ts, used for local UI work.
//
// Reads go through genlayer-js readContract (gen_call) with the retry policy in lib/rpc.ts:
// eight tries over ~40 s, because Studio answers "Contract not found" / "execution failed"
// for a healthy contract for about a minute. When a read still fails and data/snapshot.json
// holds the item, the item is returned with source "snapshot" (the page shows a banner);
// otherwise a plain Error("could not reach the network") is thrown. A failed read is never
// "no data", and never proof that a write failed: check the tx votes instead. Route handlers
// (no window) read with a budget of their own: three tries, each given up after ROUTE_READ_MS,
// no cache, no snapshot.
//
// Studio allows 30 gen_call / sim_fundAccount requests a minute from one browser. Every view
// answer is therefore cached for 30 s (keyed by register, view and args) and two components
// asking for the same view share one request; a rate-limited read rejects with RATE_LIMITED
// (see lib/rpc.ts) and the page counts the cooldown down. invalidateReads() drops the cache
// once a transaction is final or the faucet paid, so the next read is live again, and
// readOrder(id, register, { fresh: true }) drops one order's entry for a page that is waiting
// for that order to change. The shop reads its listings with one listings() call per 25
// rows; a register deployed before that view existed is read with listing_ids + listing().
//
// Stakes (v2): a seller lists with a stake, one slice of it (half the price) backs each open
// order, and a breaks verdict or an unrevealed missing section pays one slice to the buyer. A
// register deployed before stakes answers rows without those fields: the site then reads every
// stake as absent (stakeKnown false), never as zero, so it does not block a buy the old contract
// would take, and it lists without sending a stake the old list_pack would not accept.

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export type Verdict = "" | "breaks" | "keeps" | "unclear";
export type OrderStatus =
  | "paid"
  | "disputed"
  | "settled"
  | "settled_stale"
  | "released"
  | "missing"
  | "refunded";

/** Why a listing takes no new orders: "" while open, closed by its "seller", or "out_of_stake" (a slash left less than one slice). */
export type ClosedReason = "" | "seller" | "out_of_stake";

export type Listing = {
  id: string; // "L1"
  seller: string; // 0x… lowercase
  title: string;
  kind: string; // recipes | templates | notes | prompts | guide | other
  promises: string[];
  hashes: string[];
  sectionCount: number;
  priceAtto: string; // decimal string
  windowSeconds: number;
  createdAt: string; // ISO
  open: boolean;
  orders: number;
  kept: number;
  broken: number;
  unclear: number;
  /** the row carries the stake fields; false on a register deployed before stakes, where none of the fields below mean anything */
  stakeKnown: boolean;
  /** the seller's stake still on this listing (atto) */
  stakeAtto: string;
  /** one slice: half the price, fixed at listing time; one breaks verdict or unrevealed section pays it to the buyer (atto) */
  sliceAtto: string;
  /** orders that are paid, disputed or missing: each one has a slice of the stake behind it */
  openOrders: number;
  /** open orders the stake backs at a time: stake ÷ slice, rounded down */
  capacity: number;
  /** how many more buyers the stake can cover now: capacity − open orders, never below 0 */
  free: number;
  /** paid to buyers out of this listing's stake, in total (atto) */
  stakePaidAtto: string;
  closedReason: ClosedReason;
};

export type Order = {
  id: string; // "O7"
  listing: string; // "L1"
  title: string;
  buyer: string;
  seller: string;
  priceAtto: string;
  openedAt: string;
  deadlineAt: string;
  status: OrderStatus;
  sectionIndex: number; // 0-based; -1 when none
  promiseIndex: number; // 0-based; -1 when none
  bondAtto: string;
  disputedAt: string;
  verdict: Verdict;
  judgedAt: string;
  revealedText: string;
  missingIndex: number;
  missingAt: string;
  /** how many more sections this buyer may report missing; null on a register that does not publish it */
  missingReportsLeft: number | null;
  paidBuyer: string;
  paidSeller: string;
  /** the part of paidBuyer that came out of the seller's stake (one slice on breaks or refunded); "0" otherwise */
  paidFromStake: string;
  windowOpen: boolean;
  bondRequiredAtto: string;
  /** sections the seller put on chain with reveal(), ascending index (0-based); [] on older registers */
  revealed: { index: number; text: string }[];
  /** the sentence the contract wrote from closed tokens once the order reached a final status; "" before */
  verdictLine: string;
  /** the order view's own "now" (chain time, ISO); "" when the view did not send one */
  chainNow: string;
  /** Date.now() in this browser when that answer arrived; see chainTime() */
  readAtMs: number;
};

/** One section put on chain by reveal(). */
export type RevealedSection = Order["revealed"][number];

export type LedgerRow = Pick<
  Order,
  | "id"
  | "listing"
  | "title"
  | "buyer"
  | "seller"
  | "priceAtto"
  | "status"
  | "verdict"
  | "sectionIndex"
  | "promiseIndex"
  | "judgedAt"
  | "paidBuyer"
  | "paidSeller"
  | "paidFromStake"
> & { openedAt: string };

export type Stats = {
  listings: number;
  orders: number;
  kept: number;
  broken: number;
  unclear: number;
  /** refunds of the whole price because a reported section was never revealed (refund_missing only) */
  refunded: number;
  released: number;
  /** disputes settled by rule because nobody asked the validators in time (settle_stale) */
  stale: number;
  /** the register counts stakes (false before v2: the three below are then 0 and mean nothing) */
  stakeKnown: boolean;
  /** sellers' stakes held by the contract now, across every listing (atto) */
  stakeHeldAtto: string;
  /** paid to buyers out of sellers' stakes, in total (atto) */
  stakePaidAtto: string;
  /** wallets that have listed at least one pack */
  sellers: number;
};

/** One seller's public record, kept by the contract on every path that moves their money. */
export type SellerRecord = {
  seller: string; // 0x… lowercase
  /** false for an address that never listed: every number is then 0 */
  known: boolean;
  /** their listing ids, oldest first */
  listings: string[];
  listed: number;
  sold: number;
  released: number;
  kept: number;
  broken: number;
  unclear: number;
  refunded: number;
  stale: number;
  /** held now across all their listings (atto) */
  stakedAtto: string;
  /** paid to their buyers out of their stakes, in total (atto) */
  stakePaidAtto: string;
  /** ISO of their first listing; "" when none */
  firstListed: string;
};

/** The contract's STAKE_SLICE_PERCENT: one slice is this share of the price. */
export const STAKE_SLICE_PERCENT = 50n;
/** One slice of a price, as the contract fixes it at listing time. */
export const sliceOf = (priceAtto: string | bigint): bigint => (BigInt(priceAtto) * STAKE_SLICE_PERCENT) / 100n;
/** The buyer's dispute bond for a price, as the contract's _bond_for_price: 20% of it, at least 0.01 GEN. */
export function bondOf(priceAtto: string | bigint): bigint {
  const bond = (BigInt(priceAtto) * 20n) / 100n;
  return bond < 10n ** 16n ? 10n ** 16n : bond;
}

/**
 * Why the stake stops a new order on this listing, in a sentence; "" when it does not (or the
 * register has no stakes). The pack page shows it in place of a buy the contract would refuse.
 */
export function stakeBlock(l: Listing): string {
  if (!l.stakeKnown) return "";
  if (!l.open && l.closedReason === "out_of_stake") {
    return "This listing closed itself: a buyer was paid a slice of the seller's stake (a broken promise, or a section never revealed) and less than one slice is left, so it cannot back another order. Orders already open continue.";
  }
  if (l.open && l.free <= 0) {
    const n = l.capacity;
    return n > 0
      ? `The seller's stake backs ${n} open ${n === 1 ? "order" : "orders"} at a time and ${n === 1 ? "it is" : `all ${n} are`} taken. Buying opens again when one of them ends.`
      : "The seller's stake does not cover one slice, so this listing cannot back an order.";
  }
  return "";
}

export type Votes = { agree: number; disagree: number; idle: number };
export type TxStatus = {
  status: string; // PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNKNOWN
  votes: Votes;
  applied: boolean | null; // null until votes exist
  undetermined: boolean; // finished with no majority: nothing was stored
  exec: string | null; // SUCCESS | ERROR | null
  result: Record<string, unknown> | null; // the contract's JSON return, if any
  message: string; // raw decoded return / error text
};

export type ReadResult<T> = { data: T; source: "chain" | "snapshot" };

/**
 * An instant the contract wrote ("2026-09-22T17:52:39.120654Z") in ms; NaN when unreadable.
 * Fractions past the millisecond are cut (not every browser parses six digits), and an
 * instant without a zone is UTC, as the contract means it, never the reader's local time.
 */
export function parseChainTime(iso: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(
    (iso ?? "").trim(),
  );
  if (!m) return NaN;
  const frac = m[2] ? m[2].slice(0, 4) : "";
  const zone = !m[3] || m[3].toUpperCase() === "Z" ? "Z" : m[3].replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2");
  return Date.parse(m[1] + frac + zone);
}

/**
 * The chain's clock now, estimated from one order read: the view's own "now" plus the time
 * this browser has counted since the answer arrived. Windows and deadlines are compared with
 * this, not with the reader's clock, which can be minutes off. `localNow` when the answer
 * carried no readable "now" (a snapshot, or a register that does not send one).
 */
export function chainTime(o: { chainNow: string; readAtMs: number }, localNow: number = Date.now()): number {
  const at = parseChainTime(o.chainNow);
  if (!Number.isFinite(at) || !Number.isFinite(o.readAtMs) || o.readAtMs <= 0) return localNow;
  return at + (localNow - o.readAtMs);
}

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { registerOverride, siteRegister } from "./register";
import {
  RATE_LIMITED,
  ROUTE_READ_MS,
  ROUTE_RETRY,
  createReadCache,
  decodeTx,
  isMissingMethodError,
  noteFailure,
  rpc,
  sleep,
  waitForCooldown,
  withRetry,
  type RawTx,
  type RetryOptions,
} from "./rpc";
import { getChainId, getSigner, chainName } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs, waitForCooldown } from "./rpc";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
/** The register in use: this browser's choice from /deploy first, then the site's default. */
export const contractAddress = (): string => registerOverride() || siteRegister();

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads when the site has no register address yet (before the owner deploys). */
export const NO_REGISTER = "no register is configured yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED =
  "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

// The SDK's studionet object carries a dead explorer URL; the RPC and explorer hosts are set here.
const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

// ---- snapshot fallback (browser only) ---------------------------------------
// data/snapshot.json is served by GET /api/snapshot. It is used only when the live read
// failed after every retry, only for the register it was read from, and every item it
// yields is labelled. A snapshot taken before a field existed gets that field's default.

export type Snapshot = {
  takenAt?: string;
  contract?: string;
  /** the register this snapshot was read from; the fallback is used only for that register */
  register?: string;
  listingIds?: string[];
  listings?: Record<string, Listing> | Listing[];
  orders?: Record<string, Order> | Order[];
  ledger?: LedgerRow[];
  stats?: Stats;
  bonds?: Record<string, string>;
  /** seller records by lowercase address (snapshots taken after stakes existed) */
  sellers?: Record<string, SellerRecord>;
};

let snapshotCache: Promise<Snapshot | null> | null = null;
async function loadSnapshot(): Promise<Snapshot | null> {
  if (typeof window === "undefined") return null; // route handlers never fall back to a snapshot
  if (!snapshotCache) {
    snapshotCache = fetch("/api/snapshot", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : null))
      .catch(() => null);
  }
  return snapshotCache;
}

const byId = <T extends { id: string }>(coll: Record<string, T> | T[] | undefined, id: string): T | null => {
  if (!coll) return null;
  if (Array.isArray(coll)) return coll.find((x) => x.id === id) ?? null;
  return coll[id] ?? null;
};
const values = <T>(coll: Record<string, T> | T[] | undefined): T[] =>
  !coll ? [] : Array.isArray(coll) ? coll : Object.values(coll);

/** A snapshot order as an Order today: a copy, with the fields later views added set to their defaults. */
const snapOrder = (o: Order | null): Order | null =>
  o
    ? {
        ...o,
        revealed: Array.isArray(o.revealed) ? o.revealed.map((r) => ({ ...r })) : [],
        verdictLine: typeof o.verdictLine === "string" ? o.verdictLine : "",
        paidFromStake: typeof o.paidFromStake === "string" ? o.paidFromStake : "0",
        // a snapshot's clock is hours old: chainTime() falls back to the reader's own
        chainNow: "",
        readAtMs: 0,
      }
    : null;
/** A snapshot listing as a Listing today: one taken before stakes existed has none (stakeKnown false). */
const snapListing = (l: Listing | null): Listing | null =>
  l
    ? {
        ...l,
        stakeKnown: l.stakeKnown === true,
        stakeAtto: typeof l.stakeAtto === "string" ? l.stakeAtto : "0",
        sliceAtto: typeof l.sliceAtto === "string" ? l.sliceAtto : "0",
        openOrders: typeof l.openOrders === "number" ? l.openOrders : 0,
        capacity: typeof l.capacity === "number" ? l.capacity : 0,
        free: typeof l.free === "number" ? l.free : 0,
        stakePaidAtto: typeof l.stakePaidAtto === "string" ? l.stakePaidAtto : "0",
        closedReason: l.closedReason === "seller" || l.closedReason === "out_of_stake" ? l.closedReason : "",
      }
    : null;
const snapLedgerRow = (r: LedgerRow): LedgerRow => ({ ...r, paidFromStake: typeof r.paidFromStake === "string" ? r.paidFromStake : "0" });
const snapStats = (s: Stats | undefined): Stats | null =>
  s
    ? {
        ...s,
        stale: typeof s.stale === "number" ? s.stale : 0,
        stakeKnown: s.stakeKnown === true,
        stakeHeldAtto: typeof s.stakeHeldAtto === "string" ? s.stakeHeldAtto : "0",
        stakePaidAtto: typeof s.stakePaidAtto === "string" ? s.stakePaidAtto : "0",
        sellers: typeof s.sellers === "number" ? s.sellers : 0,
      }
    : null;
/** The snapshot's listings in listing order (listingIds first, when it has them). */
const snapListings = (s: Snapshot): Listing[] | null => {
  if (!s.listings) return null;
  const all = values(s.listings).map(snapListing).filter((l): l is Listing => !!l);
  if (!s.listingIds) return all;
  return s.listingIds.map((id) => all.find((l) => l.id === id)).filter((l): l is Listing => !!l);
};

// ---- reading views ----------------------------------------------------------

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return BigInt(Math.trunc(v)).toString();
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1";
const addr = (v: unknown): string => str(v).toLowerCase();
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
};

type Row = Record<string, unknown>;

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** How long a view answer is reused. Browser only: a route handler must see the chain as it is. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
/** Each answer is kept with the moment it arrived, so a cached order still knows how old its "now" is. */
type Answer = { raw: unknown; at: number };
const views = createReadCache<Answer>(onServer ? 0 : READ_TTL_MS);

/** Forget every cached view answer. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => views.clear();

/** Thrown inside this module when the register has no such view (deployed before it existed). */
const NO_SUCH_VIEW = "this register has no such view";

/** `p`, but rejected once `ms` have passed with no answer. The abandoned call is left to finish alone. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no answer in ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const viewKey = (address: string, fn: string, args: (string | number)[]) =>
  `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;

type ViewOptions = {
  /** drop the cached answer first, so this read is live */
  fresh?: boolean;
  /** true for a view an older register may lack: that refusal is not retried and throws NO_SUCH_VIEW */
  optional?: boolean;
};

/**
 * One view call with retries, through the cache, with the time its answer arrived. Throws
 * RATE_LIMITED when Studio is rate-limiting this browser, the plain network error when it
 * never answered. In a route handler the budget is ROUTE_RETRY: three tries of its own, each
 * given up after ROUTE_READ_MS, not the shared slots.
 */
async function viewAt(
  fn: string,
  args: (string | number)[] = [],
  register?: string,
  opts: ViewOptions = {},
): Promise<{ value: unknown; at: number }> {
  const address = register || contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  const key = viewKey(address, fn, args);
  if (opts.fresh) views.forget(key);
  const retry: RetryOptions = {
    ...(onServer ? ROUTE_RETRY : {}),
    bucket: "gen",
    giveUp: opts.optional ? isMissingMethodError : undefined,
  };
  try {
    const answer = await views.get(key, async () => {
      const read = () => reader().readContract({ address: address as Address, functionName: fn, args });
      const raw = await withRetry(
        // In a route handler a connection that hangs must not spend the whole request: give up
        // on it and try again on a new one, inside the same small budget. The browser keeps its
        // own long schedule, where a slow answer is still better than none.
        () => (onServer ? within(read(), ROUTE_READ_MS, fn) : read()),
        retry,
      );
      return { raw, at: Date.now() };
    });
    return { value: parseView(answer.raw), at: answer.at };
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    if (opts.optional && isMissingMethodError(e)) throw new Error(NO_SUCH_VIEW);
    throw new Error(NETWORK_ERROR);
  }
}

async function view(
  fn: string,
  args: (string | number)[] = [],
  register?: string,
  opts: ViewOptions = {},
): Promise<unknown> {
  return (await viewAt(fn, args, register, opts)).value;
}

/** A view answered with nothing (unknown id): null, "", {} or an {error}/{ok:false} shape. */
const isEmptyRow = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "" || v === "null") return true;
  if (typeof v !== "object") return true;
  const o = v as Row;
  if (Array.isArray(o)) return false;
  if (Object.keys(o).length === 0) return true;
  if ("error" in o && !("id" in o)) return true;
  if (o.ok === false) return true;
  return false;
};

const asClosedReason = (v: unknown): ClosedReason => {
  const s = str(v).toLowerCase();
  return s === "seller" || s === "out_of_stake" ? s : "";
};

export function mapListing(row: Row, id: string): Listing {
  const hashes = list(row.hashes ?? row.hashes_json);
  // A row without "stake" comes from a register deployed before stakes: every stake field is
  // then absent, not zero, and stakeKnown tells the pages not to read them.
  const stakeKnown = "stake" in row;
  const stake = BigInt(atto(row.stake));
  const slice = BigInt(atto(row.slice));
  const openOrders = num(row.open_orders ?? row.openOrders);
  const capacity = num(row.capacity, slice > 0n ? Number(stake / slice) : 0);
  return {
    id: str(row.id ?? row.listing ?? id),
    seller: addr(row.seller),
    title: str(row.title),
    kind: str(row.kind, "other"),
    promises: list(row.promises ?? row.promises_json),
    hashes,
    sectionCount: num(row.section_count ?? row.sectionCount, hashes.length),
    priceAtto: atto(row.price ?? row.price_atto ?? row.priceAtto),
    windowSeconds: num(row.window_seconds ?? row.windowSeconds),
    createdAt: str(row.created_at ?? row.createdAt),
    open: bool(row.open),
    orders: num(row.orders),
    kept: num(row.kept),
    broken: num(row.broken),
    unclear: num(row.unclear),
    stakeKnown,
    stakeAtto: stake.toString(),
    sliceAtto: slice.toString(),
    openOrders,
    capacity,
    free: Math.max(0, num(row.free, capacity - openOrders)),
    stakePaidAtto: atto(row.stake_paid ?? row.stakePaidAtto),
    closedReason: asClosedReason(row.closed_reason ?? row.closedReason),
  };
}

const ORDER_STATUSES: OrderStatus[] = [
  "paid",
  "disputed",
  "settled",
  "settled_stale",
  "released",
  "missing",
  "refunded",
];
const asStatus = (v: unknown): OrderStatus => {
  const s = str(v, "paid").toLowerCase() as OrderStatus;
  return ORDER_STATUSES.includes(s) ? s : "paid";
};
const asVerdict = (v: unknown): Verdict => {
  const s = str(v).toLowerCase();
  return s === "breaks" || s === "keeps" || s === "unclear" ? s : "";
};

/** The order view's `revealed` list: {index, text} rows, one per section, ascending. */
function mapRevealed(v: unknown): RevealedSection[] {
  const raw = typeof v === "string" ? parseView(v) : v;
  if (!Array.isArray(raw)) return [];
  const out: RevealedSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Row;
    const index = num(r.index, -1);
    if (!Number.isInteger(index) || index < 0) continue;
    if (out.some((x) => x.index === index)) continue;
    out.push({ index, text: str(r.text) });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * `readAtMs` is when the answer arrived (a cached answer keeps its first arrival), so
 * chainTime() can add the time that passed since.
 */
export function mapOrder(row: Row, id: string, readAtMs: number = Date.now()): Order {
  const status = asStatus(row.status);
  const disputed = str(row.disputed_at ?? row.disputedAt) !== "" ||
    status === "disputed" || status === "settled" || status === "settled_stale";
  const missingAt = str(row.missing_at ?? row.missingAt);
  const rawSection = row.section_index ?? row.sectionIndex;
  const rawPromise = row.promise_index ?? row.promiseIndex;
  const rawMissing = row.missing_index ?? row.missingIndex;
  const revealedText = str(row.revealed_text ?? row.revealedText);
  const judgedAt = str(row.judged_at ?? row.judgedAt);
  const missingIndex = missingAt ? num(rawMissing, -1) : -1;
  let revealed: RevealedSection[];
  if ("revealed" in row) {
    revealed = mapRevealed(row.revealed);
  } else {
    // A register deployed before `revealed` existed keeps one revealed section in
    // revealed_text until a judge overwrites it with the judged text. Before any judge, a
    // reported section that is no longer missing is that section. The page still checks it
    // against the committed hash before it shows it as delivered.
    revealed =
      revealedText && missingIndex >= 0 && status !== "missing" && !judgedAt
        ? [{ index: missingIndex, text: revealedText }]
        : [];
  }
  return {
    id: str(row.id ?? row.order ?? id),
    listing: str(row.listing),
    title: str(row.title),
    buyer: addr(row.buyer),
    seller: addr(row.seller),
    priceAtto: atto(row.price ?? row.price_atto ?? row.priceAtto),
    openedAt: str(row.opened_at ?? row.openedAt),
    deadlineAt: str(row.deadline_at ?? row.deadlineAt),
    status,
    // u32 storage cannot hold -1: an index only means something once a dispute or a
    // missing report exists, so it is -1 until then.
    sectionIndex: disputed ? num(rawSection, -1) : -1,
    promiseIndex: disputed ? num(rawPromise, -1) : -1,
    bondAtto: atto(row.bond ?? row.bond_atto ?? row.bondAtto),
    disputedAt: str(row.disputed_at ?? row.disputedAt),
    verdict: asVerdict(row.verdict),
    judgedAt,
    revealedText,
    missingIndex,
    missingAt,
    // An older register has no cap and no counter, so the page is told "unknown" rather than a
    // number it made up, and it leaves the contract to refuse a report it will not accept.
    missingReportsLeft: "missing_reports_left" in row ? num(row.missing_reports_left, 0) : null,
    paidBuyer: atto(row.paid_buyer ?? row.paidBuyer),
    paidSeller: atto(row.paid_seller ?? row.paidSeller),
    paidFromStake: atto(row.paid_from_stake ?? row.paidFromStake),
    windowOpen: bool(row.window_open ?? row.windowOpen),
    bondRequiredAtto: atto(row.bond_required ?? row.bondRequiredAtto ?? row.bond_required_atto),
    revealed,
    verdictLine: str(row.verdict_line ?? row.verdictLine),
    chainNow: str(row.now ?? row.chainNow),
    readAtMs,
  };
}

export function mapLedgerRow(row: Row): LedgerRow {
  const o = mapOrder(row, str(row.order ?? row.id));
  return {
    id: o.id,
    listing: o.listing,
    title: o.title,
    buyer: o.buyer,
    seller: o.seller,
    priceAtto: o.priceAtto,
    status: o.status,
    verdict: o.verdict,
    sectionIndex: o.sectionIndex,
    promiseIndex: o.promiseIndex,
    judgedAt: o.judgedAt,
    paidBuyer: o.paidBuyer,
    paidSeller: o.paidSeller,
    paidFromStake: o.paidFromStake,
    openedAt: o.openedAt,
  };
}

export function mapStats(row: Row): Stats {
  return {
    listings: num(row.listings),
    orders: num(row.orders),
    kept: num(row.kept),
    broken: num(row.broken),
    unclear: num(row.unclear),
    refunded: num(row.refunded),
    released: num(row.released),
    stale: num(row.stale),
    stakeKnown: "stake_held" in row,
    stakeHeldAtto: atto(row.stake_held ?? row.stakeHeldAtto),
    stakePaidAtto: atto(row.stake_paid ?? row.stakePaidAtto),
    sellers: num(row.sellers),
  };
}

/** The seller(address) view: an unknown address answers known false and zeros. */
export function mapSeller(row: Row, address: string): SellerRecord {
  return {
    seller: addr(row.seller ?? address),
    known: bool(row.known),
    listings: list(row.listings),
    listed: num(row.listed),
    sold: num(row.sold),
    released: num(row.released),
    kept: num(row.kept),
    broken: num(row.broken),
    unclear: num(row.unclear),
    refunded: num(row.refunded),
    stale: num(row.stale),
    stakedAtto: atto(row.staked ?? row.stakedAtto),
    stakePaidAtto: atto(row.stake_paid ?? row.stakePaidAtto),
    firstListed: str(row.first_listed ?? row.firstListed),
  };
}

/**
 * What a write's JSON return says, in the fields the pages act on. Every refusal of a payable call
 * is {ok: false, reason}, and the value came back in the same call; list_pack and buy also say how
 * much in `returned` (open_dispute's refusal does not, and reads "0" here). close_listing and
 * withdraw_stake say what they returned to the seller; judge and refund_missing say how much of
 * the buyer's payout came out of the seller's stake (`paid_from_stake`).
 */
export type Outcome = {
  ok: boolean;
  reason: string;
  /** atto sent back by this call: a refused payment, or the stake a close or a withdraw returned */
  returnedAtto: string;
  /** atto of the buyer's payout that came out of the seller's stake */
  fromStakeAtto: string;
  listing: string;
  order: string;
  stakeAtto: string;
  sliceAtto: string;
  capacity: number;
  /** open orders still backed by the stake after a close */
  openOrders: number;
};

export function outcomeOf(result: Record<string, unknown> | null | undefined): Outcome | null {
  if (!result || typeof result !== "object" || !("ok" in result)) return null;
  const r = result as Row;
  return {
    ok: r.ok === true,
    reason: str(r.reason),
    returnedAtto: atto(r.returned),
    fromStakeAtto: atto(r.paid_from_stake),
    listing: str(r.listing),
    order: str(r.order),
    stakeAtto: atto(r.stake),
    sliceAtto: atto(r.slice),
    capacity: num(r.capacity),
    openOrders: num(r.open_orders),
  };
}

/**
 * Live read first; on the plain network error, the snapshot item when it exists. `register`
 * is the register the live read went to (the one in use when left out).
 */
async function withSnapshot<T>(
  live: () => Promise<T>,
  fromSnapshot: (s: Snapshot) => T | null | undefined,
  register?: string,
): Promise<ReadResult<T>> {
  try {
    return { data: await live(), source: "chain" };
  } catch (e) {
    // No register, or a view this register does not have: answers, not an outage.
    if (e instanceof Error && (e.message === NO_REGISTER || e.message === NO_SUCH_VIEW)) throw e;
    const s = await loadSnapshot();
    // A snapshot only ever stands in for the register it was taken from.
    const read = (register || contractAddress()).toLowerCase();
    const same = !!s?.register && s.register.toLowerCase() === read;
    const item = s && same ? fromSnapshot(s) : null;
    if (item !== null && item !== undefined) return { data: item, source: "snapshot" };
    if (e instanceof Error && (e.message === NETWORK_ERROR || e.message === RATE_LIMITED)) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

/**
 * Runs `read` over `items` with at most `limit` in flight, results in order. The first
 * failure rejects the whole run and nothing new starts after it: a failed read is never
 * "no data", so a list with a hole in it is not an answer.
 */
async function eachLimited<T, R>(items: readonly T[], limit: number, read: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await read(items[i]);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/**
 * The source of a list built from several reads: "snapshot" as soon as one item came from
 * the snapshot, so a page never shows snapshot rows mixed into live ones without its banner.
 */
export const readSource = (results: readonly { source: "chain" | "snapshot" }[]): "chain" | "snapshot" =>
  results.some((r) => r.source === "snapshot") ? "snapshot" : "chain";

// ---- reads (no wallet) --------------------------------------------------
/** `register` names another register than the one in use. */
export async function readListingIds(register?: string): Promise<ReadResult<string[]>> {
  if (isMock) return mock.readListingIds();
  return withSnapshot(
    async () => list(await view("listing_ids", [], register)),
    (s) => s.listingIds ?? (s.listings ? values(s.listings).map((l) => l.id) : null),
    register,
  );
}
/** `register` names another register than the one in use (the delivery API passes the caller's). */
export async function readListing(
  id: string,
  register?: string,
): Promise<ReadResult<Listing | null>> {
  if (isMock) return mock.readListing(id);
  return withSnapshot(
    async () => {
      const v = await view("listing", [id], register);
      return isEmptyRow(v) ? null : mapListing(v as Row, id);
    },
    (s) => snapListing(byId(s.listings, id)),
    register,
  );
}

/** Rows per listings() call: the contract clamps a page to 1..25. */
export const LISTINGS_PAGE = 25;
/** More pages than this is a runaway loop, not a shop (1000 listings). */
const MAX_LISTING_PAGES = 40;
/**
 * Listings read one by one on a register with no listings() view. Studio allows 30 gen_call a
 * minute per client and this path costs one call per listing on top of listing_ids, so a shelf
 * of a dozen or more packs would spend the whole minute on one page load. The newest this many
 * are read; the rest of the shelf is on the ledger, and a register deployed from /deploy has the
 * listings() view and never takes this path at all.
 */
const MAX_ROWS_ONE_BY_ONE = 24;
/** Registers (lowercase) that answered they have no listings() view: asked once, then read row by row. */
const withoutListingsView = new Set<string>();

/** One page of listings(): how many the register holds, and the rows asked for. */
export type ListingPage = { total: number; rows: Listing[] };

/** The listings() answer: {"total": n, "rows": [<listing row>, …]}. */
export function mapListingPage(v: unknown): ListingPage {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
  const raw = typeof o.rows === "string" ? parseView(o.rows) : o.rows;
  const rows = (Array.isArray(raw) ? raw : [])
    .map((r) => (typeof r === "string" ? parseView(r) : r))
    .filter((r): r is Row => !isEmptyRow(r))
    .map((r) => mapListing(r, str(r.listing ?? r.id)));
  return { total: Math.max(0, num(o.total, rows.length)), rows };
}

/**
 * One listings() page, or null when this register has no such view (it is then remembered,
 * and the caller reads listing_ids + listing() instead). A snapshot stands in when Studio
 * never answered.
 */
async function listingsView<T>(
  register: string,
  live: () => Promise<T>,
  fromSnapshot: (s: Snapshot) => T | null,
): Promise<ReadResult<T> | null> {
  const key = register.toLowerCase();
  if (withoutListingsView.has(key)) return null;
  try {
    return await withSnapshot(live, fromSnapshot, register);
  } catch (e) {
    if (!(e instanceof Error && e.message === NO_SUCH_VIEW)) throw e;
    withoutListingsView.add(key);
    return null;
  }
}

/** listing_ids + one listing() per id, at most 3 in flight: the read for a register without listings(). */
async function listingsRowByRow(
  register: string,
  pick: (ids: string[]) => string[],
): Promise<ReadResult<ListingPage>> {
  const ids = await readListingIds(register);
  const rows = await eachLimited(pick(ids.data), 3, (id) => readListing(id, register));
  return {
    data: { total: ids.data.length, rows: rows.map((r) => r.data).filter((l): l is Listing => !!l) },
    source: readSource([ids, ...rows]),
  };
}

/**
 * Listings in listing order (L1 first), `limit` (1..25) from the 0-based `offset`, with the
 * total. One gen_call per page on a register with listings(); an older register is read
 * with listing_ids + listing(), at most 3 at a time.
 */
export async function readListings(offset: number, limit: number): Promise<ReadResult<ListingPage>> {
  if (isMock) return mock.readListings(offset, limit);
  const register = contractAddress();
  if (!register) throw new Error(NO_REGISTER);
  const start = Math.max(0, Math.trunc(offset) || 0);
  const size = Math.max(1, Math.min(LISTINGS_PAGE, Math.trunc(limit) || LISTINGS_PAGE));
  const page = await listingsView(
    register,
    async () => mapListingPage(await view("listings", [String(start), String(size)], register, { optional: true })),
    (s) => {
      const all = snapListings(s);
      return all ? { total: all.length, rows: all.slice(start, start + size) } : null;
    },
  );
  return page ?? listingsRowByRow(register, (ids) => ids.slice(start, start + size));
}

/** Every listing in listing order (L1 first): listings() page by page, or row by row on an older register. */
export async function readAllListings(): Promise<ReadResult<Listing[]>> {
  if (isMock) return mock.readAllListings();
  const register = contractAddress();
  if (!register) throw new Error(NO_REGISTER);
  const all = await listingsView(
    register,
    async () => {
      const rows: Listing[] = [];
      let total = Number.POSITIVE_INFINITY;
      for (let n = 0; n < MAX_LISTING_PAGES && rows.length < total; n++) {
        const p = mapListingPage(
          await view("listings", [String(rows.length), String(LISTINGS_PAGE)], register, { optional: true }),
        );
        total = p.total;
        if (!p.rows.length) break;
        rows.push(...p.rows);
      }
      return rows;
    },
    snapListings,
  );
  if (all) return all;
  // An older register, read row by row: capped, newest first in the ids, kept in listing order.
  const r = await listingsRowByRow(register, (ids) => ids.slice(-MAX_ROWS_ONE_BY_ONE));
  return { data: r.data.rows, source: r.source };
}

/**
 * `register` names another register than the one in use. `fresh` drops this order's cached
 * answer first: for a page waiting for a write to show, where the cached row is the old one.
 */
export async function readOrder(
  id: string,
  register?: string,
  opts: { fresh?: boolean } = {},
): Promise<ReadResult<Order | null>> {
  if (isMock) return mock.readOrder(id);
  const r = await withSnapshot(
    async () => {
      const { value, at } = await viewAt("order", [id], register, { fresh: opts.fresh });
      return isEmptyRow(value) ? null : mapOrder(value as Row, id, at);
    },
    (s) => snapOrder(byId(s.orders, id)),
    register,
  );
  // The order row carries no title of its own; borrow it from the listing when missing
  // (the listing is usually already in the read cache from the page that led here).
  if (r.data && !r.data.title && r.data.listing) {
    try {
      const l = await readListing(r.data.listing, register);
      if (l.data) r.data.title = l.data.title;
    } catch {
      /* the order is still readable without a title */
    }
  }
  return r;
}
export async function readOrdersOf(listing: string): Promise<ReadResult<string[]>> {
  if (isMock) return mock.readOrdersOf(listing);
  return withSnapshot(
    async () => list(await view("orders_of", [listing])),
    (s) => {
      const ids = values(s.orders).filter((o) => o.listing === listing).map((o) => o.id);
      return ids.length || s.orders ? ids : null;
    },
  );
}
export async function readOrdersOfBuyer(address: string): Promise<ReadResult<string[]>> {
  if (isMock) return mock.readOrdersOfBuyer(address);
  const a = address.toLowerCase();
  return withSnapshot(
    async () => list(await view("orders_of_buyer", [a])),
    (s) => {
      const ids = values(s.orders).filter((o) => o.buyer === a).map((o) => o.id);
      return ids.length || s.orders ? ids : null;
    },
  );
}
export async function readLedger(count: number): Promise<ReadResult<LedgerRow[]>> {
  if (isMock) return mock.readLedger(count);
  const n = Math.max(1, Math.min(500, Math.trunc(count) || 1));
  return withSnapshot(
    async () => {
      const v = await view("ledger", [String(n)]);
      const rows = Array.isArray(v) ? v : list(v);
      return rows.map((r) => mapLedgerRow(typeof r === "string" ? (parseView(r) as Row) : (r as Row)));
    },
    (s) => {
      if (s.ledger) return s.ledger.slice(0, n).map(snapLedgerRow);
      if (!s.orders) return null;
      // newest first, like the contract's ledger(count)
      return values(s.orders).slice().reverse().slice(0, n).map((o) => ({
        id: o.id, listing: o.listing, title: o.title, buyer: o.buyer, seller: o.seller,
        priceAtto: o.priceAtto, status: o.status, verdict: o.verdict, sectionIndex: o.sectionIndex,
        promiseIndex: o.promiseIndex, judgedAt: o.judgedAt, paidBuyer: o.paidBuyer,
        paidSeller: o.paidSeller, paidFromStake: o.paidFromStake ?? "0", openedAt: o.openedAt,
      }));
    },
  );
}
/** `register` names another register than the one in use (a probe of a pasted address reads its stats). */
export async function readStats(register?: string): Promise<ReadResult<Stats>> {
  if (isMock) return mock.readStats();
  return withSnapshot(
    async () => {
      const v = await view("stats", [], register);
      if (isEmptyRow(v)) throw new Error(NETWORK_ERROR);
      return mapStats(v as Row);
    },
    (s) => snapStats(s.stats),
    register,
  );
}
/** Registers (lowercase) that answered they have no seller() view: asked once, then never again. */
const withoutSellerView = new Set<string>();

/**
 * One seller's record from seller(address). `data` is null on a register deployed before seller
 * records existed (the page then says so, or adds up what the listings show); an address that
 * never listed is a record with known false and zeros.
 */
export async function readSeller(address: string, register?: string): Promise<ReadResult<SellerRecord | null>> {
  if (isMock) return mock.readSeller(address);
  const a = address.trim().toLowerCase();
  const reg = (register || contractAddress()).toLowerCase();
  if (reg && withoutSellerView.has(reg)) return { data: null, source: "chain" };
  try {
    return await withSnapshot(
      async () => {
        const v = await view("seller", [a], register, { optional: true });
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(NETWORK_ERROR);
        return mapSeller(v as Row, a);
      },
      (s) => s.sellers?.[a] ?? null,
      register,
    );
  } catch (e) {
    if (!(e instanceof Error && e.message === NO_SUCH_VIEW)) throw e;
    if (reg) withoutSellerView.add(reg);
    return { data: null, source: "chain" };
  }
}

export async function readBondFor(listing: string): Promise<string> {
  if (isMock) return mock.readBondFor(listing);
  try {
    const v = await view("bond_for", [listing]);
    return atto(typeof v === "object" && v !== null ? (v as Row).bond ?? (v as Row).bond_atto : v);
  } catch (e) {
    const s = await loadSnapshot();
    const b = s?.bonds?.[listing];
    if (b) return atto(b);
    const l = s ? byId(s.listings, listing) : null;
    if (l) return bondOf(l.priceAtto).toString();
    throw e;
  }
}

/** The rules() view, in words, for pages that show them. */
export async function readRules(): Promise<Record<string, unknown> | null> {
  if (isMock) return null;
  const v = await view("rules");
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// ---- writes (need the connected wallet from components/wallet) -----------
export type WriteFn =
  | "list_pack"
  | "close_listing"
  | "buy"
  | "open_dispute"
  | "withdraw_dispute"
  | "judge"
  | "release"
  | "report_missing"
  | "reveal"
  | "refund_missing"
  | "settle_stale"
  | "withdraw_stake";

/** One write, ready for useTx().start(fn, args, value). */
export type WriteCall = { fn: WriteFn; args: string[]; value?: bigint };

/**
 * list_pack with its stake. The stake is the value of the call (v2: payable, at least one
 * slice). `stakeAtto` null lists on a register deployed before stakes, whose list_pack takes no
 * value.
 */
export function listPackCall(
  p: { title: string; kind: string; promises: string[]; hashes: string[]; priceAtto: bigint; windowSeconds: string },
  stakeAtto: bigint | null,
): WriteCall {
  return {
    fn: "list_pack",
    args: [p.title, p.kind, JSON.stringify(p.promises), JSON.stringify(p.hashes), p.priceAtto.toString(), p.windowSeconds],
    value: stakeAtto ?? undefined,
  };
}
/** The seller stops new orders; with nothing open, the whole stake comes back in the same call. */
export const closeListingCall = (listingId: string): WriteCall => ({ fn: "close_listing", args: [listingId] });
/** A closed listing with no open orders: the rest of the stake goes back to the seller. */
export const withdrawStakeCall = (listingId: string): WriteCall => ({ fn: "withdraw_stake", args: [listingId] });

/** Sends a transaction through the connected EIP-1193 provider. Resolves to the tx hash. */
export async function write(
  fn: WriteFn,
  args: string[],
  valueAtto?: bigint,
): Promise<string> {
  if (isMock) return mock.write(fn, args, valueAtto);
  const address = contractAddress();
  if (!address) throw new Error("This site is not pointed at a register yet. Deploy your own from the Deploy page; it takes one signature and this browser then reads it.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and genlayer-js skips its own chain check for it, so the refusal to
  // sign on another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) {
    throw new Error(
      `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`,
    );
  }
  const client = createClient({
    chain: studio,
    account: signer.address as Address,
    provider: signer.provider,
  });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: fn,
    args,
    value: valueAtto ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("The wallet returned no transaction hash.");
  }
  return hash;
}

/** Deploys the contract source from the connected wallet (the /deploy page). Resolves to the deploy tx hash. */
export async function deploy(code: string): Promise<string> {
  if (isMock) return "0x" + "ad".repeat(32);
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) {
    throw new Error(
      `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`,
    );
  }
  const client = createClient({
    chain: studio,
    account: signer.address as Address,
    provider: signer.provider,
  });
  const hash = await client.deployContract({ code, args: [], leaderOnly: false });
  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("The wallet returned no transaction hash.");
  }
  return hash;
}

/** The address a deploy transaction created; "" until the network has accepted it. */
export async function deployedAddress(hash: string): Promise<string> {
  if (isMock) return "0x" + "ad".repeat(20);
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  const data = tx?.data as { contract_address?: string } | undefined;
  return typeof data?.contract_address === "string" ? data.contract_address : "";
}

/** One poll of a transaction. Pages call this every ~3 s until FINALIZED. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway, so a dropped request is just a later poll.
  // eth_* has its own bucket, so a gen_call cooldown never stalls the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth" });
  return BigInt(hex || "0x0");
}

/** Pause between faucet tries: sim_fundAccount shares the 30/min bucket with the reads. */
const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
/** How long the faucet waits for the credit to show in the balance. */
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN (amount in wei as a JS number), up to three tries ten
 * seconds apart, each one after the gen_call cooldown. Resolves when the balance moved; a
 * refusal on every try is FAUCET_REFUSED. `stillWanted` is asked between balance polls: once
 * it says no (the wallet switched accounts), the wait ends with an error nobody shows.
 */
export async function faucet(
  address: string,
  opts: { stillWanted?: () => boolean } = {},
): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: sim_fundAccount with the lowercase spelling
  // the site keeps is accepted, finalizes with value 10 GEN, and never reaches the balance.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      // A refusal is a refusal whatever the shape: 429 behind CORS, -32029, or a dropped
      // request. A rate-limited one also starts the gen_call cooldown, so the reads back off too.
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
