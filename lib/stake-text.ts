// The stake behind a listing in the words every surface uses: the site's own pages
// (components/stake.tsx), the card other sites embed (app/embed/[id]) and the badge
// (/api/badge/[id]), which render on the server and so cannot call into a client module. No React here.

import type { BadgeTone } from "./badge";
import type { Listing } from "./chain";
import { gen } from "./format";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Backed by X GEN · N more buyers can be covered now", or why it covers nobody now. Nothing before stakes. */
export function backingText(l: Listing): string {
  if (!l.stakeKnown) return "";
  const stake = BigInt(l.stakeAtto);
  if (!l.open && l.closedReason === "out_of_stake") {
    return `Out of stake: ${gen(l.stakePaidAtto)} of it went to buyers and less than one slice is left`;
  }
  if (!l.open) {
    return stake > 0n
      ? `Closed · ${gen(stake)} of stake still held${l.openOrders > 0 ? ` for ${plural(l.openOrders, "open order", "open orders")}` : ""}`
      : "Closed · no stake left on it";
  }
  if (l.free <= 0) return `Backed by ${gen(stake)} · every slice is taken by an open order`;
  return `Backed by ${gen(stake)} · ${plural(l.free, "more buyer", "more buyers")} can be covered now`;
}

/**
 * What the badge says about a listing, and in which colour: drawn by /api/badge/[id] for other
 * sites, and previewed on the pack page from the row it already read. Warn once a promise broke
 * or the stake has paid a buyer (a reported section the seller never revealed is no breaks
 * verdict, but it is money out of the stake); grey once the listing is closed.
 */
export function badgeMessage(l: Listing): { text: string; tone: BadgeTone } {
  const paid = l.stakeKnown ? BigInt(l.stakePaidAtto) : 0n;
  const parts = [`${l.orders} sold`];
  // A register deployed before stakes has none to show; kept is shown in its place.
  if (l.stakeKnown) parts.push(`${l.broken} broken`, `${gen(l.stakeAtto)} staked`);
  else parts.push(`${l.kept} kept`, `${l.broken} broken`);
  if (paid > 0n) parts.push(`${gen(paid)} paid to buyers`);
  if (!l.open) parts.unshift(l.closedReason === "out_of_stake" ? "out of stake" : "closed");
  return { text: parts.join(" · "), tone: !l.open ? "neutral" : l.broken > 0 || paid > 0n ? "warn" : "good" };
}
