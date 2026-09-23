// Server side: which register, and which site, a delivery-API request is about.
//
// The browser sends the register it reads (see lib/register.ts) with every request; the routes
// read the chain there and key the stored pack by it. Without one, the site's own default applies.
//
// Any other register is used only once its deployed code is known to be this contract: the
// sha256 of gen_getContractCode must equal the sha256 of public/contracts/as_described.py (the
// file /deploy deploys) or of an earlier release listed below. Anything else is refused with 400
// before the route reads the chain, so a made-up address cannot hold a route in its retry loop,
// and a look-alike contract cannot name itself the seller of a listing and fill the pack store.
// Answers are remembered per server instance in a bounded map; the site default never needs one.
//
// Studio looks contracts up by the checksummed address (a lowercase one is "not found"), so the
// register handed to the chain readers is always checksummed; store keys and signed messages
// lowercase it themselves.
// Under NEXT_PUBLIC_MOCK=1 every request is about the mock register, but only when the site is not
// a deployment: see mockAllowed below.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAddress } from "viem";
import { MOCK_REGISTER } from "./api";
import { isMock, RPC_URL } from "./chain";
import { siteRegister, isAddress } from "./register";

export { MOCK_REGISTER };

/** sha256 of the deployed bytes of earlier releases whose registers the delivery API still serves. */
const EARLIER_RELEASES = [
  "5fc6a51c18599242a1d7c46dd85a19b3440bd64fba79af0983a074777e702649", // first release, deployed 18 Sep 2026
];
const CONTRACT_FILE = path.join(process.cwd(), "public", "contracts", "as_described.py");

/** How many registers one server instance remembers; the oldest answer is dropped first. */
const MAX_REMEMBERED = 256;
/** "No contract there" can be Studio's answer for a minute after a deploy, so it is kept only briefly. */
const MISSING_TTL_MS = 15_000;
/** Code lookups for unknown registers one instance makes per minute; past that it answers 503. */
const LOOKUPS_PER_MINUTE = 20;
const LOOKUP_TIMEOUT_MS = 8_000;

export const NO_SITE_REGISTER = "this site is not pointed at a register yet";

/**
 * Mock mode as the delivery routes may honour it: never on a deployment.
 *
 * In mock mode the routes ask for no signature and vet no register, which is what makes local UI
 * work possible without a key for the mock seller and buyer. NEXT_PUBLIC_MOCK is an ordinary
 * build-time variable, though, so one mistyped entry in a hosting dashboard would otherwise turn
 * every authorisation check off at once on a live site. On a deployment (VERCEL is set) the routes
 * therefore demand a signature and a vetted register whatever the flag says; the pages keep their
 * mock UI either way.
 */
export const mockAllowed = isMock && !process.env.VERCEL;

export type RegisterCheck =
  | { ok: true; register: string } // checksummed 0x address, or MOCK_REGISTER
  | { ok: false; status: 400 | 503; reason: string };

type Outcome =
  | { kind: "ours" }
  | { kind: "other"; sha: string }
  | { kind: "missing" }
  | { kind: "unreachable" };

const remembered = new Map<string, { outcome: Outcome; at: number }>();
const pending = new Map<string, Promise<Outcome>>();
let lookupTimes: number[] = [];

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function remember(key: string, outcome: Outcome): void {
  if (outcome.kind === "unreachable") return;
  remembered.delete(key);
  while (remembered.size >= MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
  remembered.set(key, { outcome, at: Date.now() });
}

function recalled(key: string): Outcome | null {
  const hit = remembered.get(key);
  if (!hit) return null;
  if (hit.outcome.kind === "missing" && Date.now() - hit.at > MISSING_TTL_MS) {
    remembered.delete(key);
    return null;
  }
  return hit.outcome;
}

function takeLookup(now: number): boolean {
  lookupTimes = lookupTimes.filter((t) => now - t < 60_000);
  if (lookupTimes.length >= LOOKUPS_PER_MINUTE) return false;
  lookupTimes.push(now);
  return true;
}

// ---- the chain reads the delivery routes make, per caller ------------------------------------

/** Chain reads one caller may cause through the delivery routes in a minute. */
const READS_PER_MINUTE = 10;
/** How many callers one server instance keeps a count for; past that the oldest is dropped. */
const MAX_CALLERS = 2000;

export const TOO_MANY_READS = "too many pack requests from this address in the last minute; try again shortly";

const readTimes = new Map<string, number[]>();

/** The caller a budget is kept for: the client address the host puts in x-forwarded-for, else one shared count. */
export function callerOf(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = (forwarded.split(",")[0] || "").trim();
  return first.slice(0, 64) || "all";
}

/**
 * True when this caller may spend another chain read here, and counts it.
 *
 * Signing a read message is free and local, so the 401 gate alone does not stop anybody sending
 * pack requests in a loop with a key of their own; each one costs the server up to ROUTE_RETRY
 * gen_call out of Studio's 30 a minute, and once Studio rate-limits, every later server read waits
 * out the cooldown. Ten a minute is far above anything an honest buyer or seller does, and it caps
 * what one caller can take from everybody else at one bucketful.
 */
export function takeChainRead(caller: string, now: number = Date.now()): boolean {
  const recent = (readTimes.get(caller) ?? []).filter((t) => now - t < 60_000);
  readTimes.delete(caller);
  if (recent.length >= READS_PER_MINUTE) {
    readTimes.set(caller, recent);
    return false;
  }
  recent.push(now);
  while (readTimes.size >= MAX_CALLERS) {
    const oldest = readTimes.keys().next().value;
    if (oldest === undefined) break;
    readTimes.delete(oldest);
  }
  readTimes.set(caller, recent);
  return true;
}

/** The code hashes a register may run: the repository file (read fresh, it is small) and the earlier releases. */
async function acceptedHashes(): Promise<Set<string>> {
  const accepted = new Set(EARLIER_RELEASES);
  try {
    accepted.add(sha256(await readFile(CONTRACT_FILE)));
  } catch {
    /* the earlier releases still apply */
  }
  return accepted;
}

/** gen_getContractCode answers base64 (Studio today) or 0x hex; either way, the bytes. */
function codeBytes(result: unknown): Uint8Array | null {
  if (typeof result !== "string" || !result) return null;
  if (/^0x[0-9a-fA-F]*$/.test(result)) return Buffer.from(result.slice(2), "hex");
  return Buffer.from(result, "base64");
}

/** One code lookup, two tries at most: a route handler never sits in a long retry loop for it. */
async function lookUp(address: string): Promise<Outcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [address] }),
        cache: "no-store",
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (res.status === 429) return { kind: "unreachable" }; // rate-limited: say so, never retry into it
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: { code?: number; message?: string } };
      if (body.error) {
        if (/not found/i.test(body.error.message ?? "")) return { kind: "missing" };
        if (body.error.code === -32029) return { kind: "unreachable" };
        throw new Error(body.error.message ?? "rpc error");
      }
      const bytes = codeBytes(body.result);
      if (!bytes || bytes.length === 0) return { kind: "missing" };
      const sha = sha256(bytes);
      return (await acceptedHashes()).has(sha) ? { kind: "ours" } : { kind: "other", sha };
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { kind: "unreachable" };
}

/**
 * The register a request names (or the site default when it names none), checked as described
 * above. `{ ok: false }` carries the status and reason the route answers with, before any chain read.
 */
export async function checkRegister(candidate: unknown): Promise<RegisterCheck> {
  if (mockAllowed) return { ok: true, register: MOCK_REGISTER };
  const named = typeof candidate === "string" ? candidate.trim() : "";
  if (named && !isAddress(named)) return { ok: false, status: 400, reason: "register must be a 0x address" };
  const site = siteRegister();
  const raw = named || site;
  if (!raw || !isAddress(raw)) return { ok: false, status: 503, reason: NO_SITE_REGISTER };
  const register = getAddress(raw);
  if (site && register.toLowerCase() === site.toLowerCase()) return { ok: true, register };

  const key = register.toLowerCase();
  let outcome = recalled(key);
  if (!outcome) {
    let running = pending.get(key);
    if (!running) {
      if (!takeLookup(Date.now())) {
        return {
          ok: false,
          status: 503,
          reason: "the site checked many new registers in the last minute; try again in a minute",
        };
      }
      running = lookUp(register).finally(() => pending.delete(key));
      pending.set(key, running);
    }
    outcome = await running;
    remember(key, outcome);
  }
  switch (outcome.kind) {
    case "ours":
      return { ok: true, register };
    case "other":
      return {
        ok: false,
        status: 400,
        reason: `register ${register} does not run the As Described contract (its code hashes to ${outcome.sha.slice(0, 12)}…); deploy one from /deploy`,
      };
    case "missing":
      return {
        ok: false,
        status: 400,
        reason: `Studio has no contract at ${register} (a register deployed in the last minute may not be visible yet; try again shortly)`,
      };
    default:
      return { ok: false, status: 503, reason: `could not check register ${register} on Studio right now; try again shortly` };
  }
}

/** The register argument the chain readers take: undefined for the mock, the address otherwise. */
export const chainRegister = (register: string): string | undefined =>
  register === MOCK_REGISTER ? undefined : register;

/**
 * The host this request reached, which is what the signed messages name as `site`: on Vercel the
 * Host header is the public host the page was loaded from, and it is also what routes the request
 * here, so a caller cannot claim another site's host and still reach this one. (x-forwarded-host is
 * not read: a caller can set it.)
 */
export function siteOf(req: Request): string {
  return req.headers.get("host") || new URL(req.url).host;
}
