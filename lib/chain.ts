// Chain access for As Described — the ONE interface every page codes against.
// Real implementation: genlayer-js 1.1.8 against GenLayer Studio (chain 61999).
// Mock implementation (NEXT_PUBLIC_MOCK=1): lib/chain-mock.ts, used for local UI work.
//
// Reads go through genlayer-js readContract (gen_call) with the retry policy in lib/rpc.ts:
// eight tries over ~40 s, because Studio answers "Contract not found" / "execution failed"
// for a healthy contract for about a minute. When a read still fails and data/snapshot.json
// holds the item, the item is returned with source "snapshot" (the page shows a banner);
// otherwise a plain Error("could not reach the network") is thrown. A failed read is never
// "no data", and never proof that a write failed: check the tx votes instead.

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
  paidBuyer: string;
  paidSeller: string;
  windowOpen: boolean;
  bondRequiredAtto: string;
};

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
> & { openedAt: string };

export type Stats = {
  listings: number;
  orders: number;
  kept: number;
  broken: number;
  unclear: number;
  refunded: number;
  released: number;
};

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

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";
import { registerOverride, siteRegister } from "./register";
import { decodeTx, rpc, sleep, withRetry, type RawTx } from "./rpc";
import { getChainId, getSigner, chainName } from "./wallet";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
/** The register in use: this browser's choice from /deploy first, then the site's default. */
export const contractAddress = (): string => registerOverride() || siteRegister();

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads when the site has no register address yet (before the owner deploys). */
export const NO_REGISTER = "no register is configured yet";

// The SDK's studionet object carries a dead explorer URL; the RPC and explorer hosts are set here.
const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

// ---- snapshot fallback (browser only) ---------------------------------------
// data/snapshot.json is shipped by the ui agent and served by GET /api/snapshot. It is used
// only when the live read failed after every retry, and every item it yields is labelled.

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

/** One view call with retries. Throws the plain network error when it never answered. */
async function view(fn: string, args: (string | number)[] = [], register?: string): Promise<unknown> {
  const address = register || contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  try {
    const raw = await withRetry(() =>
      reader().readContract({ address: address as Address, functionName: fn, args }),
    );
    return parseView(raw);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
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

export function mapListing(row: Row, id: string): Listing {
  const hashes = list(row.hashes ?? row.hashes_json);
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

export function mapOrder(row: Row, id: string): Order {
  const status = asStatus(row.status);
  const disputed = str(row.disputed_at ?? row.disputedAt) !== "" ||
    status === "disputed" || status === "settled" || status === "settled_stale";
  const missingAt = str(row.missing_at ?? row.missingAt);
  const rawSection = row.section_index ?? row.sectionIndex;
  const rawPromise = row.promise_index ?? row.promiseIndex;
  const rawMissing = row.missing_index ?? row.missingIndex;
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
    judgedAt: str(row.judged_at ?? row.judgedAt),
    revealedText: str(row.revealed_text ?? row.revealedText),
    missingIndex: missingAt ? num(rawMissing, -1) : -1,
    missingAt,
    paidBuyer: atto(row.paid_buyer ?? row.paidBuyer),
    paidSeller: atto(row.paid_seller ?? row.paidSeller),
    windowOpen: bool(row.window_open ?? row.windowOpen),
    bondRequiredAtto: atto(row.bond_required ?? row.bondRequiredAtto ?? row.bond_required_atto),
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
  };
}

/** Live read first; on the plain network error, the snapshot item when it exists. */
async function withSnapshot<T>(
  live: () => Promise<T>,
  fromSnapshot: (s: Snapshot) => T | null | undefined,
): Promise<ReadResult<T>> {
  try {
    return { data: await live(), source: "chain" };
  } catch (e) {
    if (e instanceof Error && e.message === NO_REGISTER) throw e;
    const s = await loadSnapshot();
    // A snapshot only ever stands in for the register it was taken from.
    const same = !!s?.register && s.register.toLowerCase() === contractAddress().toLowerCase();
    const item = s && same ? fromSnapshot(s) : null;
    if (item !== null && item !== undefined) return { data: item, source: "snapshot" };
    throw e instanceof Error && e.message === NETWORK_ERROR ? e : new Error(NETWORK_ERROR);
  }
}

// ---- reads (no wallet) --------------------------------------------------
export async function readListingIds(): Promise<ReadResult<string[]>> {
  if (isMock) return mock.readListingIds();
  return withSnapshot(
    async () => list(await view("listing_ids")),
    (s) => s.listingIds ?? (s.listings ? values(s.listings).map((l) => l.id) : null),
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
    (s) => byId(s.listings, id),
  );
}
export async function readOrder(id: string, register?: string): Promise<ReadResult<Order | null>> {
  if (isMock) return mock.readOrder(id);
  const r = await withSnapshot(
    async () => {
      const v = await view("order", [id], register);
      return isEmptyRow(v) ? null : mapOrder(v as Row, id);
    },
    (s) => byId(s.orders, id),
  );
  // The order row carries no title of its own; borrow it from the listing when missing.
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
      if (s.ledger) return s.ledger.slice(0, n);
      if (!s.orders) return null;
      // newest first, like the contract's ledger(count)
      return values(s.orders).slice().reverse().slice(0, n).map((o) => ({
        id: o.id, listing: o.listing, title: o.title, buyer: o.buyer, seller: o.seller,
        priceAtto: o.priceAtto, status: o.status, verdict: o.verdict, sectionIndex: o.sectionIndex,
        promiseIndex: o.promiseIndex, judgedAt: o.judgedAt, paidBuyer: o.paidBuyer,
        paidSeller: o.paidSeller, openedAt: o.openedAt,
      }));
    },
  );
}
export async function readStats(): Promise<ReadResult<Stats>> {
  if (isMock) return mock.readStats();
  return withSnapshot(
    async () => mapStats((await view("stats")) as Row),
    (s) => s.stats ?? null,
  );
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
    if (l) {
      const bond = (BigInt(l.priceAtto) * 20n) / 100n;
      return (bond < 10n ** 16n ? 10n ** 16n : bond).toString();
    }
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
  | "judge"
  | "release"
  | "report_missing"
  | "reveal"
  | "refund_missing"
  | "settle_stale";

/** Sends a transaction through the connected EIP-1193 provider. Resolves to the tx hash. */
export async function write(
  fn: WriteFn,
  args: string[],
  valueAtto?: bigint,
): Promise<string> {
  if (isMock) return mock.write(fn, args, valueAtto);
  const address = contractAddress();
  if (!address) throw new Error("This site is not pointed at a register yet. Deploy one from the Deploy page, or wait for the site owner.");
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
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), 2);
  const data = tx?.data as { contract_address?: string } | undefined;
  return typeof data?.contract_address === "string" ? data.contract_address : "";
}

/** One poll of a transaction. Pages call this every ~3 s until FINALIZED. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway, so a dropped request is just a later poll.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), 2);
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), 3);
  return BigInt(hex || "0x0");
}

/** Faucet: sim_fundAccount with 10 GEN (amount in wei as a JS number). Resolves when the balance moved. */
export async function faucet(address: string): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  const before = await balanceOf(address);
  // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
  await rpc("sim_fundAccount", { account_address: address, amount: 10e18 });
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await sleep(2000);
    try {
      const now = await balanceOf(address);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
