// GET /api/packs/[id]/status?register=0x… → { ok: true, uploaded: boolean }
// Whether the seller has uploaded the pack for this listing on this register. No wallet, no
// chain read: the answer is only "is there a stored body", never its contents or its location.
// A demo pack needs no stored body (its text ships with the site); the browser recognises one by
// its committed hashes (lib/demo-keys.ts), so this route never has to read the listing.
// A register other than the site default is checked once by its code hash (lib/register-param.ts).

import { hasPack, isListingId } from "@/lib/store";
import { checkRegister } from "@/lib/register-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id", uploaded: false });
  const checked = await checkRegister(new URL(req.url).searchParams.get("register"));
  if (!checked.ok) return reply(checked.status, { ok: false, reason: checked.reason, uploaded: false });
  try {
    return reply(200, { ok: true, uploaded: await hasPack(checked.register, id) });
  } catch {
    return reply(500, { ok: false, reason: "the store did not answer", uploaded: false });
  }
}
