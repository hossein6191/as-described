// Chain access for As Described — the ONE interface every page codes against.
// Real implementation: genlayer-js 1.1.8 against GenLayer Studio (chain 61999).
// Mock implementation (NEXT_PUBLIC_MOCK=1): lib/chain-mock.ts, used for local UI work.
// The infra agent replaces the bodies below; the exported names and types stay.

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

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
export const contractAddress = (): string =>
  process.env.NEXT_PUBLIC_CONTRACT || "";

// ---- reads (no wallet) --------------------------------------------------
export async function readListingIds(): Promise<ReadResult<string[]>> {
  return { data: [], source: "chain" };
}
export async function readListing(
  id: string,
): Promise<ReadResult<Listing | null>> {
  void id;
  return { data: null, source: "chain" };
}
export async function readOrder(id: string): Promise<ReadResult<Order | null>> {
  void id;
  return { data: null, source: "chain" };
}
export async function readOrdersOf(listing: string): Promise<ReadResult<string[]>> {
  void listing;
  return { data: [], source: "chain" };
}
export async function readOrdersOfBuyer(address: string): Promise<ReadResult<string[]>> {
  void address;
  return { data: [], source: "chain" };
}
export async function readLedger(count: number): Promise<ReadResult<LedgerRow[]>> {
  void count;
  return { data: [], source: "chain" };
}
export async function readStats(): Promise<ReadResult<Stats>> {
  return {
    data: { listings: 0, orders: 0, kept: 0, broken: 0, unclear: 0, refunded: 0, released: 0 },
    source: "chain",
  };
}
export async function readBondFor(listing: string): Promise<string> {
  void listing;
  return "0";
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
  void fn;
  void args;
  void valueAtto;
  throw new Error("chain.write: not implemented (stub)");
}

/** One poll of a transaction. Pages call this every ~3 s until FINALIZED. */
export async function txStatus(hash: string): Promise<TxStatus> {
  void hash;
  return {
    status: "UNKNOWN",
    votes: { agree: 0, disagree: 0, idle: 0 },
    applied: null,
    undetermined: false,
    exec: null,
    result: null,
    message: "",
  };
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  void address;
  return 0n;
}

/** Faucet: sim_fundAccount with 10 GEN (amount in wei as a JS number). Resolves when the balance moved. */
export async function faucet(address: string): Promise<bigint> {
  void address;
  return 0n;
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
