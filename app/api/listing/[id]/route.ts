// GET /api/listing/[id] → one listing and its seller's public record, as JSON, for any website.
// Read-only and open to every origin (CORS *): nothing here is private, it is what the contract's
// own views answer anyone. The site's register only (lib/public-listing.ts); one answer is reused
// for a minute here and may be cached for a minute by whatever sits in front. `stale_read: true`
// with `read_at` says an older answer stood in for a read that could not be made. Amounts are atto
// as decimal strings, field names as the contract's views write them. Documented in docs/API.md.

import { callerOf } from "@/lib/budget";
import { bondOf, CHAIN_ID, type Listing, type SellerRecord } from "@/lib/chain";
import { readPublicListing } from "@/lib/public-listing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
// No stale-while-revalidate, as for the badge: a cache in front never serves an expired answer once more.
const CACHE = "public, max-age=60, s-maxage=60";
const SHORT = "public, max-age=15, s-maxage=15";

const reply = (status: number, body: Record<string, unknown>, cache: string) =>
  Response.json(body, { status, headers: { ...CORS, "cache-control": cache } });

function listingJson(l: Listing) {
  // A register deployed before stakes has none: those fields are null, never a made-up zero.
  const stake = (v: string | number) => (l.stakeKnown ? v : null);
  return {
    // the contract's listing row names its id "listing"
    listing: l.id,
    title: l.title,
    kind: l.kind,
    seller: l.seller,
    price: l.priceAtto,
    bond: bondOf(l.priceAtto).toString(),
    promises: l.promises,
    hashes: l.hashes,
    section_count: l.sectionCount,
    window_seconds: l.windowSeconds,
    created_at: l.createdAt,
    open: l.open,
    closed_reason: l.closedReason,
    orders: l.orders,
    kept: l.kept,
    broken: l.broken,
    unclear: l.unclear,
    // the one field the contract does not write: false on a register deployed before stakes
    stakes: l.stakeKnown,
    stake: stake(l.stakeAtto),
    slice: stake(l.sliceAtto),
    open_orders: stake(l.openOrders),
    capacity: stake(l.capacity),
    free: stake(l.free),
    stake_paid: stake(l.stakePaidAtto),
  };
}

const sellerJson = (s: SellerRecord) => ({
  seller: s.seller,
  known: s.known,
  listings: s.listings,
  listed: s.listed,
  sold: s.sold,
  released: s.released,
  kept: s.kept,
  broken: s.broken,
  unclear: s.unclear,
  refunded: s.refunded,
  stale: s.stale,
  staked: s.stakedAtto,
  stake_paid: s.stakePaidAtto,
  first_listed: s.firstListed,
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const read = await readPublicListing(id, callerOf(req));
  if (!read.ok) return reply(read.status, { ok: false, listing: id, reason: read.reason }, "no-store");
  if (!read.data) return reply(404, { ok: false, listing: id, reason: `there is no listing ${id} on this register` }, SHORT);

  const { listing: l, seller, register } = read.data;
  const site = new URL(req.url).origin;
  return reply(
    200,
    {
      ok: true,
      register,
      chain_id: CHAIN_ID,
      read_at: new Date(read.readAt).toISOString(),
      stale_read: read.stale,
      listing: listingJson(l),
      seller: seller ? sellerJson(seller) : null,
      links: {
        pack: `${site}/pack/${l.id}`,
        embed: `${site}/embed/${l.id}`,
        badge: `${site}/api/badge/${l.id}`,
        seller: `${site}/seller/${l.seller}`,
      },
    },
    read.stale ? SHORT : CACHE,
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}
