// POST /api/packs/[id]/upload  { sections: string[], address, signature }
// The seller's pack contents, accepted only when: the signature over uploadMessage(id, manifest)
// recovers to `address`; the chain says `address` is the listing's seller; and sha256 of every
// section equals the hash the seller committed on chain, count included. Stored sealed.
// NEXT_PUBLIC_MOCK=1: the chain check runs against lib/chain-mock and the signature is not
// required for the mock seller (there is no key for that address); documented in docs/API.md.

import { createHash } from "node:crypto";
import { verifyMessage } from "viem";
import { manifestOf, uploadMessage } from "@/lib/api";
import { isMock, readListing, NETWORK_ERROR } from "@/lib/chain";
import { isListingId, savePack } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SECTIONS = 20;
const MAX_SECTION_CHARS = 4000;
const HEX64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id" });

  let body: { sections?: unknown; address?: unknown; signature?: unknown };
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
  if (!sections.every((s) => typeof s === "string" && s.length >= 1 && s.length <= MAX_SECTION_CHARS)) {
    return reply(400, { ok: false, reason: `every section must be text of 1 to ${MAX_SECTION_CHARS} characters` });
  }
  const texts = sections as string[];

  // The chain is the authority on who the seller is and what was committed.
  let listing;
  try {
    listing = (await readListing(id)).data;
  } catch (e) {
    const reason = e instanceof Error && e.message === NETWORK_ERROR ? NETWORK_ERROR : "could not read the listing";
    return reply(503, { ok: false, reason });
  }
  if (!listing) return reply(404, { ok: false, reason: `listing ${id} does not exist` });
  if (listing.seller !== address) return reply(403, { ok: false, reason: "only the listing's seller may upload its pack" });

  const hashes = listing.hashes.map((h) => h.toLowerCase());
  if (!hashes.every((h) => HEX64.test(h))) return reply(409, { ok: false, reason: "the listing's hashes are malformed" });
  if (hashes.length !== texts.length) {
    return reply(409, { ok: false, reason: `the listing commits ${hashes.length} sections, ${texts.length} were sent` });
  }
  for (let i = 0; i < texts.length; i++) {
    if (sha256(texts[i]) !== hashes[i]) {
      return reply(409, { ok: false, reason: `section ${i + 1} does not hash to what the listing committed` });
    }
  }

  // Signature: the seller signed the manifest of these exact hashes for this listing.
  const message = uploadMessage(id, await manifestOf(hashes));
  if (!signature) {
    if (!isMock) return reply(401, { ok: false, reason: "signature is required" });
    // mock mode: the mock seller's key is not available; the address check above stands in
  } else {
    let valid = false;
    try {
      valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    } catch {
      valid = false;
    }
    if (!valid) return reply(401, { ok: false, reason: "the signature does not match the upload message for this listing" });
  }

  try {
    await savePack({
      listing: id,
      seller: address,
      hashes,
      sections: texts,
      uploadedAt: new Date().toISOString(),
    });
  } catch {
    return reply(500, { ok: false, reason: "the pack could not be stored" });
  }
  return reply(200, { ok: true, listing: id, sections: texts.length });
}
