// JSON-RPC against GenLayer Studio, with the retry policy the network needs, plus the
// decoders every caller of eth_getTransactionByHash shares.
//
// Studio answers "Contract not found" / "execution failed" for a perfectly healthy contract
// for about a minute after a deploy or under load, and drops the odd request. A single
// attempt is a coin toss, four quick attempts fit inside the bad minute. Reads therefore
// retry eight times with a growing pause, about forty seconds in all, and only then fail.
// A failed read is never an answer: callers must say "could not reach the network", never
// "no data", and must never conclude a write failed from a read that failed.

export const RPC_URL = "https://studio.genlayer.com/api";

/** Pauses between the eight tries: 1+2+3+5+7+9+12 = 39 s in all. */
export const RETRY_SCHEDULE_MS = [1000, 2000, 3000, 5000, 7000, 9000, 12000];
export const RETRY_TRIES = RETRY_SCHEDULE_MS.length + 1;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RpcError extends Error {
  code: number | undefined;
  data: unknown;
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

let nextId = 1;

/** One JSON-RPC call. Throws RpcError on a JSON-RPC error, Error on transport failure. */
export async function rpc<T = unknown>(
  method: string,
  params: unknown = [],
  url: string = RPC_URL,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc ${method}: HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: T;
    error?: { code?: number; message?: string; data?: unknown };
  };
  if (body.error) {
    throw new RpcError(
      body.error.message || `rpc ${method} failed`,
      body.error.code,
      body.error.data,
    );
  }
  return body.result as T;
}

/**
 * Runs `fn` up to `tries` times with the backoff schedule above. Every error is retried:
 * on Studio a read can fail for reasons that have nothing to do with the request.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  tries: number = RETRY_TRIES,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      if (i === tries - 1) break;
      onRetry?.(i, e);
      await sleep(RETRY_SCHEDULE_MS[Math.min(i, RETRY_SCHEDULE_MS.length - 1)]);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** JSON-RPC call with the retry policy. */
export const rpcRetry = <T = unknown>(method: string, params: unknown = [], tries?: number) =>
  withRetry<T>(() => rpc<T>(method, params), tries);

// ---- decoding a transaction ----------------------------------------------

export type VoteTally = { agree: number; disagree: number; idle: number };

/** Decodes the base64 `leader_receipt.result` into text (browser and node). */
export function base64ToText(b64: string): string {
  if (!b64) return "";
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** The contract's JSON return sits after a calldata prefix; take the first `{` onwards. */
export function jsonFromText(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  if (end < start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Non-printable bytes removed, so a decoded return can be shown as is. */
export const printable = (text: string) => text.replace(/[^\x20-\x7e\n]/g, " ").trim();

/** Tally of `consensus_data.votes` ({ address: "agree" | "disagree" | "idle" | ... }). */
export function tallyVotes(votes: unknown): VoteTally {
  const t: VoteTally = { agree: 0, disagree: 0, idle: 0 };
  if (!votes || typeof votes !== "object") return t;
  for (const v of Object.values(votes as Record<string, unknown>)) {
    const s = String(v).toLowerCase();
    if (s === "agree") t.agree++;
    else if (s === "disagree") t.disagree++;
    else t.idle++;
  }
  return t;
}

export const totalVotes = (t: VoteTally) => t.agree + t.disagree + t.idle;

/** A round applied its state only when a strict majority agreed. */
export const isApplied = (t: VoteTally) => t.agree * 2 > totalVotes(t);

/** Statuses after which nothing more happens to a transaction. */
export const FINAL_STATUSES = new Set(["FINALIZED", "CANCELED", "UNDETERMINED"]);

/** The stage names the rail shows, in order. */
export const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];

export type RawTx = {
  hash?: string;
  status?: string | number;
  consensus_data?: {
    votes?: Record<string, string>;
    leader_receipt?: LeaderReceipt | LeaderReceipt[];
  };
  consensus_history?: unknown;
  result?: unknown;
  [k: string]: unknown;
};

export type LeaderReceipt = {
  result?: string;
  execution_result?: string;
  [k: string]: unknown;
};

const STATUS_NAMES: Record<number, string> = {
  0: "PENDING",
  1: "CANCELED",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
};

/** Studio returns the status by name; older nodes by number. Always a name. */
export function statusName(s: unknown): string {
  if (typeof s === "number") return STATUS_NAMES[s] ?? "UNKNOWN";
  if (typeof s === "string" && s) {
    const n = Number(s);
    if (!Number.isNaN(n) && /^\d+$/.test(s)) return STATUS_NAMES[n] ?? "UNKNOWN";
    return s.toUpperCase();
  }
  return "UNKNOWN";
}

export const leaderReceiptOf = (tx: RawTx): LeaderReceipt | null => {
  const lr = tx.consensus_data?.leader_receipt;
  if (!lr) return null;
  return Array.isArray(lr) ? (lr[0] ?? null) : lr;
};

/**
 * "Undetermined" = the transaction finished without a majority, so nothing was stored.
 * Seen either as the UNDETERMINED status, as a finished tx whose tally has no strict
 * majority, or as an "Undetermined" entry in consensus_history.
 */
export function isUndetermined(tx: RawTx, tally: VoteTally): boolean {
  const status = statusName(tx.status);
  if (status === "UNDETERMINED") return true;
  if (status === "FINALIZED" && totalVotes(tally) > 0 && !isApplied(tally)) return true;
  if (tx.consensus_history) {
    try {
      if (JSON.stringify(tx.consensus_history).includes("Undetermined")) return true;
    } catch {
      /* not serialisable: ignore */
    }
  }
  return false;
}

export type DecodedTx = {
  status: string;
  votes: VoteTally;
  applied: boolean | null;
  undetermined: boolean;
  exec: string | null;
  result: Record<string, unknown> | null;
  message: string;
};

/** Everything a page needs from one eth_getTransactionByHash answer. */
export function decodeTx(tx: RawTx | null | undefined): DecodedTx {
  if (!tx) {
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
  const status = statusName(tx.status);
  const votes = tallyVotes(tx.consensus_data?.votes);
  const receipt = leaderReceiptOf(tx);
  const text = receipt?.result ? base64ToText(receipt.result) : "";
  const result = jsonFromText(text);
  const exec = receipt?.execution_result ? String(receipt.execution_result).toUpperCase() : null;
  const undetermined = isUndetermined(tx, votes);
  const applied =
    status === "CANCELED" || undetermined
      ? false
      : totalVotes(votes) > 0
        ? isApplied(votes)
        : null;
  return {
    status,
    votes,
    applied,
    undetermined,
    exec,
    result,
    message: printable(text),
  };
}
