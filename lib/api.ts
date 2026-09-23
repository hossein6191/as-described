// Client helpers for the delivery API (app/api/packs/[id]/…), and the two messages the wallet
// signs (personal_sign). Both sides build the messages with the functions below, so they stay
// byte-identical: the browser from the host it is on and the register it reads, the route
// handler from its own host and the register it checked. Lines are joined by "\n", no trailing
// newline, the register in lowercase:
//
//   upload:   As Described
//             Signing proves you are the seller of this listing, so the site stores its sections. It is not a transaction and moves no GEN.
//             action: upload-pack
//             site: as-described.vercel.app
//             chain: 61999
//             register: <the register's 0x address>
//             listing: L3
//             manifest: <sha256 hex of the section hashes joined by ",">
//
//   read:     As Described
//             Signing proves you are the buyer of this order, so the site shows you its sections. It is not a transaction and moves no GEN.
//             action: read-pack
//             site: as-described.vercel.app
//             chain: 61999
//             register: <the register's 0x address>
//             order: O7
//
// The route handlers verify these with viem's verifyMessage against the address given, then
// check the chain: the upload signer must be the listing's seller and every section must hash
// to what the seller committed; the read signer must be the order's buyer, and the order must be
// for the listing in the URL. Because the site, the chain and the register are part of what was
// signed, a signature given to another copy of this site, or for the same order id on another
// register, is refused here.

import { CHAIN_ID, contractAddress, isMock, readListing } from "./chain";

/** `checked` is false when the site could not tell (the route refused or never answered), not "nothing uploaded". */
export type PackStatus = { uploaded: boolean; checked: boolean };

/** How long one delivery answer is reused in this tab before the store is asked again. */
const STATUS_MEMO_MS = 8000;
const statusMemo = new Map<string, { value: PackStatus; at: number }>();
function keepStatus(key: string, value: PackStatus): PackStatus {
  // A failed check is not kept: the next page to ask should get a real answer, not this one.
  if (value.checked) statusMemo.set(key, { value, at: Date.now() });
  if (statusMemo.size > 200) statusMemo.delete(statusMemo.keys().next().value as string);
  return value;
}

/** Forgets what the site knows about delivery, so the next ask reaches the store (after an upload). */
export function forgetPackStatus(): void {
  statusMemo.clear();
}

/**
 * `status` is the HTTP status the route answered with, or 0 when the site was never reached.
 * Callers need it to tell one refusal from another without matching words in the reason:
 * only a 401 retires a cached signature, and only a 200 is an answer about a stored pack.
 */
type ApiReply = { ok: boolean; status: number; reason?: string; sections?: string[]; uploaded?: boolean };

async function call(path: string, init?: RequestInit): Promise<ApiReply> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const text = await res.text();
    let body: Omit<ApiReply, "status"> | null = null;
    try {
      body = text ? (JSON.parse(text) as Omit<ApiReply, "status">) : null;
    } catch {
      body = null;
    }
    if (body && typeof body.ok === "boolean") return { ...body, status: res.status };
    return { ok: false, status: res.status, reason: `the site answered ${res.status} without a reason` };
  } catch {
    return { ok: false, status: 0, reason: "could not reach the site" };
  }
}

export type StorageStatus = { available: boolean; backend: "blob" | "local" | "none" | "unknown" };

/** Whether this host can store uploaded packs (the demo packs never need it). */
export async function storageStatus(): Promise<StorageStatus> {
  const r = (await call("/api/storage")) as ApiReply & { available?: boolean; backend?: StorageStatus["backend"] };
  return { available: r.ok && r.available === true, backend: r.ok && r.backend ? r.backend : "unknown" };
}

/**
 * Whether a buyer of this listing can read its pack: the seller uploaded it, or it committed
 * exactly a demo pack's hashes (whose text ships with the site and needs no upload). The route
 * only knows about stored bodies; the demo check runs here, on the listing the page has usually
 * just read (the read cache answers it without another request).
 *
 * `opts.demo` is that answer when the caller already has it. `demo: false` means "this pack is
 * not a demo pack": the listing is then never re-read, which saves one gen_call per undelivered
 * custom pack on a page that lists many.
 */
export async function packStatus(listingId: string, opts: { demo?: boolean } = {}): Promise<PackStatus> {
  const register = contractAddress();
  const key = `${register.toLowerCase()}/${listingId}`;
  const held = statusMemo.get(key);
  // /shop, a pack page and /orders can each ask about the same pack within a second of each
  // other. One answer serves them all for a few seconds: the delivery store is a paid lookup
  // per request, and the route's own budget is per caller (lib/budget.ts).
  if (held && Date.now() - held.at < STATUS_MEMO_MS) return held.value;
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/status?register=${encodeURIComponent(register)}`);
  if (r.status === 200 && r.ok && r.uploaded === true) return keepStatus(key, { uploaded: true, checked: true });
  // A 400, 429, 500 or 503 (or no answer at all) is not "nothing uploaded"; say the site could not check.
  const checked = r.status === 200;
  if (opts.demo !== undefined) return keepStatus(key, { uploaded: opts.demo, checked: checked || opts.demo });
  try {
    const listing = (await readListing(listingId)).data;
    if (!listing) return keepStatus(key, { uploaded: false, checked });
    const { isDemoHashes } = await import("./demo-keys");
    const demo = await isDemoHashes(listing.hashes);
    return keepStatus(key, { uploaded: demo, checked: checked || demo });
  } catch {
    return { uploaded: false, checked: false };
  }
}

/** Seller uploads the section texts after `list_pack` confirmed. `signature` is personal_sign of uploadMessage(). */
export async function uploadPack(
  listingId: string,
  sections: string[],
  address: string,
  signature: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sections, address, signature, register: contractAddress() }),
  });
  return { ok: r.ok, status: r.status, reason: r.reason };
}

/** Buyer fetches the sections of an order. `signature` is personal_sign of readMessage(). */
export async function fetchPack(
  listingId: string,
  orderId: string,
  address: string,
  signature: string,
  issued: string,
): Promise<{ ok: boolean; status: number; sections?: string[]; reason?: string }> {
  const r = await call(`/api/packs/${encodeURIComponent(listingId)}/pack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: orderId, address, signature, issued, register: contractAddress() }),
  });
  return { ok: r.ok, status: r.status, sections: r.sections, reason: r.reason };
}

// ---- the signed messages ---------------------------------------------------------

/** What a signature is bound to besides its own listing or order: the site's host and the register. */
export type SignScope = { site: string; register: string };

/** The register name the messages carry under NEXT_PUBLIC_MOCK=1 (lib/register-param.ts uses the same). */
export const MOCK_REGISTER = "mock";

/** The scope this browser signs for: the host it is on and the register it reads. */
export function browserScope(): SignScope {
  return {
    site: typeof window === "undefined" ? "" : window.location.host,
    register: isMock ? MOCK_REGISTER : contractAddress(),
  };
}

const UPLOAD_WHY =
  "Signing proves you are the seller of this listing, so the site stores its sections. It is not a transaction and moves no GEN.";
const READ_WHY =
  "Signing proves you are the buyer of this order, so the site shows you its sections. It is not a transaction and moves no GEN.";

const heading = (action: string, why: string, scope: SignScope) =>
  [
    "As Described",
    why,
    `action: ${action}`,
    `site: ${scope.site}`,
    `chain: ${CHAIN_ID}`,
    `register: ${scope.register.toLowerCase()}`,
  ].join("\n");

/** The upload message for an explicit scope (the route handler passes its own host and the checked register). */
export const uploadMessageFor = (scope: SignScope, listingId: string, manifest: string) =>
  `${heading("upload-pack", UPLOAD_WHY, scope)}\nlisting: ${listingId}\nmanifest: ${manifest}`;

/**
 * How long a read signature is worth anything, and how far ahead of this server a signer's clock
 * may be. Without a window the signature is a bearer token with no end: the route accepts any
 * request whose signature recovers to the order's buyer, from any client, for ever, and the
 * browser keeps one in localStorage. A week is long enough that an ordinary buyer signs once and
 * comes back to their pack; five minutes of skew is the usual allowance for an unsynchronised clock.
 */
export const READ_SIG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const READ_SIG_SKEW_MS = 5 * 60 * 1000;

/** An ISO-8601 instant to the minute: what a read message names as the moment it was issued. */
export const issuedNow = (now: number = Date.now()) => new Date(now).toISOString().slice(0, 16) + "Z";

/** True when `issued` is a readable instant inside the window above. */
export function issuedIsFresh(issued: unknown, now: number = Date.now()): boolean {
  if (typeof issued !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(issued)) return false;
  const at = Date.parse(issued);
  if (Number.isNaN(at)) return false;
  return now - at >= -READ_SIG_SKEW_MS && now - at <= READ_SIG_MAX_AGE_MS;
}

/**
 * The read message for an explicit scope.
 *
 * `listing` is named as well as `order`, so the signature says which pack it is for rather than
 * leaving that to the order row the route reads afterwards; `issued` is what bounds it in time.
 */
export const readMessageFor = (scope: SignScope, orderId: string, listingId: string, issued: string) =>
  `${heading("read-pack", READ_WHY, scope)}\nlisting: ${listingId}\norder: ${orderId}\nissued: ${issued}`;

/** The upload message this browser signs: this host, the register in use. */
export const uploadMessage = (listingId: string, manifest: string) =>
  uploadMessageFor(browserScope(), listingId, manifest);

/** The read message this browser signs: this host, the register in use, and the minute it signed. */
export const readMessage = (orderId: string, listingId: string, issued: string) =>
  readMessageFor(browserScope(), orderId, listingId, issued);

/** sha256 hex of a utf-8 string, in the browser (WebCrypto). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The manifest the upload message binds: sha256 of the hashes joined by ",". */
export async function manifestOf(hashes: string[]): Promise<string> {
  return sha256Hex(hashes.join(","));
}
