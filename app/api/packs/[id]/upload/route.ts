// POST /api/packs/[id]/upload  { sections: string[], address, signature, register }
// The seller's pack contents, accepted only when, in this order: the register is the site
// default or runs this contract's code (lib/register-param.ts); the signature over uploadMessage
// (this site's host, chain 61999, that register, the listing, the manifest of the sent sections'
// hashes) recovers to `address`; the chain says `address` is the listing's seller; and sha256 of
// every section equals the hash the seller committed on chain, count included. Nothing is read
// from the chain before the first two pass, and the chain read is budgeted per caller. Stored
// sealed, and a register this deployment does not own may keep only so much here (lib/store.ts).
// NEXT_PUBLIC_MOCK=1 outside a deployment: the chain check runs against lib/chain-mock and the
// signature is not required for the mock seller (there is no key for that address); documented in
// docs/API.md.

import { createHash } from "node:crypto";
import { verifyMessage } from "viem";
import { manifestOf, uploadMessageFor } from "@/lib/api";
import { readListing, NETWORK_ERROR } from "@/lib/chain";
import { isListingId, savePack, storageAvailable, STORE_LIMIT } from "@/lib/store";
import { demoSectionsFor } from "@/lib/demo-store";
import { callerOf, chainRegister, checkRegister, mockAllowed, siteOf, takeChainRead, TOO_MANY_READS } from "@/lib/register-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SECTIONS = 20;
const MAX_SECTION_CHARS = 4000;
const HEX64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Characters as the contract counts them (code points), not UTF-16 code units. */
const chars = (s: string) => Array.from(s).length;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id" });

  let body: { sections?: unknown; address?: unknown; signature?: unknown; register?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return reply(400, { ok: false, reason: "body must be JSON" });
  }
  const sections = body.sections;
  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!ADDRESS.test(address)) return reply(400, { ok: false, reason: "address must be a 0x address" });
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > MAX_SECTIONS) {
    return reply(400, { ok: false, reason: `sections must be a list of 1 to ${MAX_SECTIONS} strings` });
  }
  // Code points, as the contract counts them: String.length counts UTF-16 code units, so a
  // section of 2,500 emoji is 2,500 characters to the contract and 5,000 here. A listing the
  // contract accepts (list_pack takes hashes only) could then never be delivered.
  if (!sections.every((s) => typeof s === "string" && s.length >= 1 && chars(s) <= MAX_SECTION_CHARS)) {
    return reply(400, { ok: false, reason: `every section must be text of 1 to ${MAX_SECTION_CHARS} characters` });
  }
  const texts = sections as string[];

  // Vetting an unknown register is itself a chain read, and it happens before any signature, so
  // it is budgeted against the caller inside checkRegister (lib/register-param.ts).
  const caller = callerOf(req);
  const checked = await checkRegister(body.register, caller);
  if (!checked.ok) return reply(checked.status, { ok: false, reason: checked.reason });
  const register = checked.register;

  // Signature first: the seller signed the manifest of these exact section hashes for this listing
  // on this site and register. The message is rebuilt here, never taken from the caller.
  const hashes = texts.map(sha256);
  const message = uploadMessageFor({ site: siteOf(req), register }, id, await manifestOf(hashes));
  if (!signature) {
    if (!mockAllowed) return reply(401, { ok: false, reason: "signature is required" });
    // mock mode: the mock seller's key is not available; the seller check below stands in
  } else {
    let valid = false;
    try {
      valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    } catch {
      valid = false;
    }
    if (!valid) {
      return reply(401, {
        ok: false,
        reason: "the signature does not match the upload message for this listing on this site and register",
      });
    }
  }

  // A signature costs the signer nothing, so the chain read below is also budgeted per caller.
  // Where no header identifies the caller, the verified signer is the key, not one shared bucket.
  if (!takeChainRead(caller === "all" ? address : caller)) return reply(429, { ok: false, reason: TOO_MANY_READS });

  // The chain is the authority on who the seller is and what was committed.
  let listing;
  try {
    listing = (await readListing(id, chainRegister(register))).data;
  } catch (e) {
    const reason = e instanceof Error && e.message === NETWORK_ERROR ? NETWORK_ERROR : "could not read the listing";
    return reply(503, { ok: false, reason });
  }
  if (!listing) return reply(404, { ok: false, reason: `listing ${id} does not exist` });
  if (listing.seller !== address) return reply(403, { ok: false, reason: "only the listing's seller may upload its pack" });

  const committed = listing.hashes.map((h) => h.toLowerCase());
  if (!committed.every((h) => HEX64.test(h))) return reply(409, { ok: false, reason: "the listing's hashes are malformed" });
  if (committed.length !== texts.length) {
    return reply(409, { ok: false, reason: `the listing commits ${committed.length} sections, ${texts.length} were sent` });
  }
  for (let i = 0; i < texts.length; i++) {
    if (hashes[i] !== committed[i]) {
      return reply(409, { ok: false, reason: `section ${i + 1} does not hash to what the listing committed` });
    }
  }

  // A demo pack's text ships with the site: nothing to store, the pack is already deliverable.
  if (demoSectionsFor(hashes)) return reply(200, { ok: true, listing: id, sections: texts.length, stored: "demo" });

  if (!(await storageAvailable())) {
    return reply(503, {
      ok: false,
      reason: "This deployment has no pack store, so only the demo packs can be listed here. A pack of your own needs the local .data/ folder when the site runs from the repository, or a Blob store on your own deployment.",
    });
  }
  try {
    await savePack({
      register,
      listing: id,
      seller: address,
      hashes,
      sections: texts,
      uploadedAt: new Date().toISOString(),
    });
  } catch (e) {
    const why = e instanceof Error ? e.message.slice(0, 160) : "";
    // A register this deployment does not own may keep only so much here (lib/store.ts).
    if (why === STORE_LIMIT) {
      return reply(503, {
        ok: false,
        reason:
          "This deployment stores a limited number of packs per register, and this register has reached it. Deploy the site from the repository with a store of your own, or sell a demo pack, whose text ships with the site.",
      });
    }
    return reply(500, { ok: false, reason: "the pack could not be stored" + (why ? ": " + why : "") });
  }
  return reply(200, { ok: true, listing: id, sections: texts.length, stored: "store" });
}
