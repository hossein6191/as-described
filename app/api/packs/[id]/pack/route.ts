// POST /api/packs/[id]/pack  { order, address, signature }
// The buyer reads the sections of an order: the signature over readMessage(order) must recover
// to `address`; the chain says `address` is the order's buyer and the order belongs to listing
// [id]. Returns { ok, sections }. The seller's copy is never served to anybody else.
// NEXT_PUBLIC_MOCK=1: chain checks against lib/chain-mock; the signature is not required for the
// mock buyer (no key exists for that address); documented in docs/API.md.

import { verifyMessage } from "viem";
import { readMessage } from "@/lib/api";
import { isMock, readListing, readOrder, NETWORK_ERROR } from "@/lib/chain";
import { demoSectionsFor } from "@/lib/demo-store";
import { isListingId, isOrderId, loadPack } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id" });

  let body: { order?: unknown; address?: unknown; signature?: unknown };
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

  const message = readMessage(orderId);
  if (!signature) {
    if (!isMock) return reply(401, { ok: false, reason: "signature is required" });
  } else {
    let valid = false;
    try {
      valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    } catch {
      valid = false;
    }
    if (!valid) return reply(401, { ok: false, reason: "the signature does not match the read message for this order" });
  }

  let order;
  try {
    order = (await readOrder(orderId)).data;
  } catch (e) {
    const reason = e instanceof Error && e.message === NETWORK_ERROR ? NETWORK_ERROR : "could not read the order";
    return reply(503, { ok: false, reason });
  }
  if (!order) return reply(404, { ok: false, reason: `order ${orderId} does not exist` });
  if (order.listing !== id) return reply(403, { ok: false, reason: `order ${orderId} is not for listing ${id}` });
  if (order.buyer !== address) return reply(403, { ok: false, reason: "only the order's buyer may read this pack" });

  let pack;
  try {
    pack = await loadPack(id);
  } catch {
    return reply(500, { ok: false, reason: "the stored pack could not be opened" });
  }
  if (pack) {
    return reply(200, { ok: true, order: orderId, listing: id, sections: pack.sections, uploadedAt: pack.uploadedAt });
  }
  // No stored body: a listing that committed exactly a demo pack's hashes is served from the repository.
  let listing = null;
  try {
    listing = (await readListing(id)).data;
  } catch {
    listing = null;
  }
  const demo = listing ? demoSectionsFor(listing.hashes) : null;
  if (demo) return reply(200, { ok: true, order: orderId, listing: id, sections: demo, uploadedAt: "", source: "demo" });
  return reply(404, { ok: false, reason: "the seller has not uploaded this pack yet" });
}
