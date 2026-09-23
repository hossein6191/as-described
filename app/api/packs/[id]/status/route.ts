// GET /api/packs/[id]/status?register=0x… → { ok: true, uploaded: boolean }
// Whether the seller has uploaded the pack for this listing on this register.
// No wallet and no contract view call. A register other than the site default costs one
// gen_getContractCode the first time it is seen (lib/register-param.ts). The answer is only
// whether a stored body exists, never its contents or its location.
// A demo pack needs no stored body (its text ships with the site); the browser recognises one by
// its committed hashes (lib/demo-keys.ts), so this route never has to read the listing.
// Every request spends one slot of the caller's delivery-check budget: there is no signature in
// front of this one, and each call is a lookup in the pack store, which a deployment pays for.
// That budget is its own and far looser than a chain read's, because a shop page asks this once
// per pack on the shelf.

import { hasPack, isListingId } from "@/lib/store";
import { callerOf, checkRegister, takeDeliveryCheck, TOO_MANY_CHECKS } from "@/lib/register-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id", uploaded: false });
  const caller = callerOf(req);
  if (!takeDeliveryCheck(caller)) return reply(429, { ok: false, reason: TOO_MANY_CHECKS, uploaded: false });
  const checked = await checkRegister(new URL(req.url).searchParams.get("register"), caller);
  if (!checked.ok) return reply(checked.status, { ok: false, reason: checked.reason, uploaded: false });
  try {
    return reply(200, { ok: true, uploaded: await hasPack(checked.register, id) });
  } catch {
    return reply(500, { ok: false, reason: "the store did not answer", uploaded: false });
  }
}
