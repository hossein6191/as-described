// GET /api/packs/[id]/status → { ok: true, uploaded: boolean }
// Whether the seller has uploaded the pack for this listing. No wallet, no chain read: the
// answer is only "is there a stored body", never its contents or its location.

import { hasPack, isListingId } from "@/lib/store";
import { readListing } from "@/lib/chain";
import { demoSectionsFor } from "@/lib/demo-store";
import { chainRegister, registerOf } from "@/lib/register-param";

// A listing whose hashes are a demo pack's is "uploaded" without a stored body; remembered for a minute
// so the shop grid does not read the chain once per card on every visit.
const demoMemo = new Map<string, { at: number; uploaded: boolean }>();
async function demoUploaded(register: string, id: string): Promise<boolean> {
  const key = register.toLowerCase() + "/" + id;
  const hit = demoMemo.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.uploaded;
  let uploaded = false;
  try {
    const listing = (await readListing(id, chainRegister(register))).data;
    uploaded = !!listing && demoSectionsFor(listing.hashes) !== null;
  } catch {
    uploaded = false;
  }
  demoMemo.set(key, { at: Date.now(), uploaded });
  return uploaded;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return reply(400, { ok: false, reason: "bad listing id", uploaded: false });
  const register = registerOf(new URL(req.url).searchParams.get("register"));
  if (!register) return reply(200, { ok: true, uploaded: false });
  try {
    const stored = await hasPack(register, id);
    return reply(200, { ok: true, uploaded: stored || (await demoUploaded(register, id)) });
  } catch {
    return reply(500, { ok: false, reason: "the store did not answer", uploaded: false });
  }
}
