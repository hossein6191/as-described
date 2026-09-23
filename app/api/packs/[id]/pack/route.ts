// POST /api/packs/[id]/pack  { order, address, signature, register }
// The buyer reads the sections of an order. In this order, and nothing is read from the chain
// before the first two pass: the register is the site default or runs this contract's code
// (lib/register-param.ts); the signature over readMessage (this site's host, chain 61999, that
// register, the order) recovers to `address`; then the chain says `address` is the order's buyer
// and the order belongs to listing [id]. Returns { ok, sections }. The seller's copy is never
// served to anybody else. Past the signature the chain reads are budgeted per caller, because
// signing this message costs the signer nothing.
// NEXT_PUBLIC_MOCK=1 outside a deployment: chain checks against lib/chain-mock; the signature is
// not required for the mock buyer (no key exists for that address); documented in docs/API.md.

import { verifyMessage } from "viem";
import { readMessageFor } from "@/lib/api";
import { readListing, readOrder, NETWORK_ERROR } from "@/lib/chain";
import { demoSectionsFor } from "@/lib/demo-store";
import { isListingId, isOrderId, loadPack } from "@/lib/store";
import { callerOf, chainRegister, checkRegister, mockAllowed, siteOf, takeChainRead, TOO_MANY_READS } from "@/lib/register-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id" });

  let body: { order?: unknown; address?: unknown; signature?: unknown; register?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return reply(400, { ok: false, reason: "body must be JSON" });
  }
  const orderId = typeof body.order === "string" ? body.order : "";
  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!isOrderId(orderId)) return reply(400, { ok: false, reason: "order must be an order id like O7" });
  if (!ADDRESS.test(address)) return reply(400, { ok: false, reason: "address must be a 0x address" });

  const checked = await checkRegister(body.register);
  if (!checked.ok) return reply(checked.status, { ok: false, reason: checked.reason });
  const register = checked.register;

  // The message is rebuilt here from this host and the checked register, never taken from the caller.
  const message = readMessageFor({ site: siteOf(req), register }, orderId);
  if (!signature) {
    if (!mockAllowed) return reply(401, { ok: false, reason: "signature is required" });
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
        reason: "the signature does not match the read message for this order on this site and register",
      });
    }
  }

  // A signature costs the signer nothing, so the chain reads below are also budgeted per caller.
  if (!takeChainRead(callerOf(req))) return reply(429, { ok: false, reason: TOO_MANY_READS });

  let order;
  try {
    order = (await readOrder(orderId, chainRegister(register))).data;
  } catch (e) {
    const reason = e instanceof Error && e.message === NETWORK_ERROR ? NETWORK_ERROR : "could not read the order";
    return reply(503, { ok: false, reason });
  }
  if (!order) return reply(404, { ok: false, reason: `order ${orderId} does not exist` });
  if (order.listing !== id) return reply(403, { ok: false, reason: `order ${orderId} is not for listing ${id}` });
  if (order.buyer !== address) return reply(403, { ok: false, reason: "only the order's buyer may read this pack" });

  let pack = null;
  let storeFailed = false;
  try {
    pack = await loadPack(register, id);
  } catch {
    // Remembered, not answered yet: a demo pack is never in the store, so a store that is down or
    // holding a body this deployment cannot open must not take the demo packs down with it.
    storeFailed = true;
  }
  if (pack) {
    return reply(200, { ok: true, order: orderId, listing: id, sections: pack.sections, uploadedAt: pack.uploadedAt });
  }
  // No stored body: a listing that committed exactly a demo pack's hashes is served from the repository.
  let listing = null;
  try {
    listing = (await readListing(id, chainRegister(register))).data;
  } catch {
    listing = null;
  }
  const demo = listing ? demoSectionsFor(listing.hashes) : null;
  if (demo) return reply(200, { ok: true, order: orderId, listing: id, sections: demo, uploadedAt: "", source: "demo" });
  if (storeFailed) return reply(500, { ok: false, reason: "the stored pack could not be opened" });
  return reply(404, { ok: false, reason: "the seller has not uploaded this pack yet" });
}
