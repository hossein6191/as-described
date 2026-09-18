// GET /api/packs/[id]/status → { ok: true, uploaded: boolean }
// Whether the seller has uploaded the pack for this listing. No wallet, no chain read: the
// answer is only "is there a stored body", never its contents or its location.

import { hasPack, isListingId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id", uploaded: false });
  try {
    return reply(200, { ok: true, uploaded: await hasPack(id) });
  } catch {
    return reply(500, { ok: false, reason: "the store did not answer", uploaded: false });
  }
}
