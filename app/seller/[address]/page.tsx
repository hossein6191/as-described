"use client";

// One seller's public record: the counts the contract keeps for every seller (sold, released,
// kept, broken, refunded, settled by rule), the stake they hold now and what it has paid to
// buyers, their listings with the stake behind each, and their recent orders from the ledger.
// No wallet needed; the seller sees Close and Withdraw on their own listings. On a register
// deployed before seller records, the page adds up what the listings show and says so.

import * as React from "react";
import Link from "next/link";
import { RefreshCw, ShieldCheck, Store } from "lucide-react";

import { Address } from "@/components/address";
import { LedgerTable } from "@/components/ledger-table";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { YourRegisterNotice } from "@/components/register-line";
import { BackingLine, StakeControls } from "@/components/stake";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tally } from "@/components/ui/product-card";
import { useRead } from "@/components/use-read";
import { useWallet } from "@/components/wallet";
import {
  invalidateReads,
  isMock,
  readAllListings,
  readLedger,
  readSeller,
  type LedgerRow,
  type Listing,
  type SellerRecord,
} from "@/lib/chain";
import { gen, kindEmoji, when, windowLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The contract's ledger view answers at most this many rows, newest first. */
const LEDGER_ROWS = 50;

const isAddress = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

type SellerPage = {
  record: SellerRecord;
  /** true when the register has no seller() view and the record was added up from the listings */
  counted: boolean;
  /** this seller's listings, newest first */
  listings: Listing[];
  /** their orders among the latest LEDGER_ROWS; null when the ledger did not answer */
  orders: LedgerRow[] | null;
};

/** What the listings alone can say about a seller, for a register deployed before seller records. */
function countedRecord(address: string, mine: Listing[]): SellerRecord {
  const sum = (pick: (l: Listing) => number) => mine.reduce((n, l) => n + pick(l), 0);
  return {
    seller: address,
    known: mine.length > 0,
    listings: mine.map((l) => l.id).reverse(),
    listed: mine.length,
    sold: sum((l) => l.orders),
    released: 0,
    kept: sum((l) => l.kept),
    broken: sum((l) => l.broken),
    unclear: sum((l) => l.unclear),
    refunded: 0,
    stale: 0,
    stakedAtto: "0",
    stakePaidAtto: "0",
    firstListed: mine.length ? mine[mine.length - 1].createdAt : "",
  };
}

/**
 * Three reads: seller(address), the listings view (one call per 25 packs) and the ledger. The
 * ledger is context: a failed ledger read leaves the record and the listings standing.
 */
async function readSellerPage(address: string) {
  const [record, all, ledger] = await Promise.all([
    readSeller(address),
    readAllListings(),
    readLedger(LEDGER_ROWS).catch(() => null),
  ]);
  const mine = all.data.filter((l) => l.seller.toLowerCase() === address).reverse();
  const data: SellerPage = {
    record: record.data ?? countedRecord(address, mine),
    counted: record.data === null,
    listings: mine,
    orders: ledger ? ledger.data.filter((r) => r.seller.toLowerCase() === address) : null,
  };
  const snapshot = [record, all, ledger].some((r) => r?.source === "snapshot");
  return { data, source: snapshot ? "snapshot" : "chain" } as const;
}

function Tile({ value, label, note, tone }: { value: React.ReactNode; label: string; note: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" title={note}>
      <dd className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

export default function SellerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = React.use(params);
  const address = decodeURIComponent(raw).trim().toLowerCase();
  const valid = isAddress(address);
  const w = useWallet();
  const state = useRead(() => readSellerPage(address), [address], { enabled: valid });
  // Mock mode has no wallet, so it plays the seller too: the Close and Withdraw buttons are live.
  const isOwner = isMock || (!!w.address && w.address.toLowerCase() === address);
  const live = state.source !== "snapshot";
  const refresh = () => {
    invalidateReads();
    state.retry();
  };

  if (!valid) {
    return (
      <div className="container-site py-8">
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <span className="font-mono break-all">{raw}</span> is not a 0x address.{" "}
          <Link href="/shop" className="text-primary underline-offset-4 hover:underline">
            Back to the shop.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container-site space-y-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Store className="size-7 shrink-0 text-primary" /> Seller
          </h1>
          {/* a div, not a p: the address carries its copy and explorer actions in a div of their own */}
          <div className="text-sm">
            <Address value={address} head={10} tail={8} />
            {isOwner && !isMock ? <Badge variant="outline" className="ml-2">you</Badge> : null}
          </div>
          <p className="text-muted-foreground">
            Every number here is kept by the contract, on the same calls that move this seller&apos;s money. No wallet needed.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={state.loading}>
          <RefreshCw className={state.loading ? "animate-spin" : undefined} /> Refresh
        </Button>
      </div>

      <ReadBlock
        state={state}
        skeleton={
          <div className="space-y-3">
            <BlockSkeleton lines={2} />
            <BlockSkeleton lines={3} />
          </div>
        }
        emptyWhen={(d) => !d.record.known && d.listings.length === 0}
        empty={
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>
              The network answered: this address has not listed a pack on this register.{" "}
              <Link href="/shop" className="text-primary underline-offset-4 hover:underline">
                Open the shop.
              </Link>
            </p>
            <YourRegisterNotice className="justify-center" />
          </div>
        }
      >
        {(d) => {
          const r = d.record;
          return (
            <div className="space-y-10">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Record</h2>
                {d.counted ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    This register was deployed before seller records and stakes, so these numbers are added up from the listings
                    below: sales and verdicts only. Releases and refunds are on each order.
                  </p>
                ) : null}
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Tile value={r.listed} label="Packs listed" note="Listings this wallet made on the register." />
                  <Tile value={r.sold} label="Sold" note="Orders paid into escrow on this seller's packs." />
                  {!d.counted ? (
                    <Tile value={r.released} label="Released" note="Sales whose dispute window closed with no dispute: the price went to the seller." />
                  ) : null}
                  <Tile
                    value={r.kept}
                    label="Kept (seller won)"
                    tone={r.kept ? "text-keeps" : undefined}
                    note="Disputes where the validators found the section keeps the promise."
                  />
                  <Tile
                    value={r.broken}
                    label="Broken (buyer won)"
                    tone={r.broken ? "text-breaks" : undefined}
                    note={`Disputes where the validators found the section breaks the promise: the buyer got the price and the bond back${d.counted ? "" : ", and one slice of the stake"}.`}
                  />
                  <Tile value={r.unclear} label="Unclear" note="Disputes the validators could not settle either way." />
                  {!d.counted ? (
                    <>
                      <Tile
                        value={r.refunded}
                        label="Missing-section refunds"
                        tone={r.refunded ? "text-breaks" : undefined}
                        note="Reported sections this seller never revealed: the buyer got the price back and one slice of the stake."
                      />
                      <Tile value={r.stale} label="Settled by rule" note="Disputes nobody asked the validators about within 24 hours." />
                    </>
                  ) : null}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Kept and broken are verdicts on disputed sections. Anyone who buys can open a dispute, the seller too from a second
                  wallet, so this is a record of what was judged, not a rating.
                </p>
              </section>

              {!d.counted ? (
                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ShieldCheck className="size-5 text-primary" /> Stake
                  </h2>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Tile value={gen(r.stakedAtto)} label="Held now, across every listing" note="The contract holds it; each open order has one slice of it behind it." />
                    <Tile
                      value={gen(r.stakePaidAtto)}
                      label="Paid to buyers from it"
                      tone={BigInt(r.stakePaidAtto) > 0n ? "text-breaks" : undefined}
                      note="One slice per breaks verdict and per reported section never revealed."
                    />
                    <Tile value={r.firstListed ? when(r.firstListed) : "—"} label="First listed" note="When this wallet listed its first pack." />
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    A seller lists with a stake. One slice of it, half the price, backs each open order; a broken promise or a section
                    never revealed pays that slice to the buyer, on top of their refund. What is left comes back when the seller closes
                    a listing with nothing open.
                  </p>
                </section>
              ) : null}

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Listings ({d.listings.length})</h2>
                {d.listings.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No listings read on this visit.</p>
                ) : (
                  <ul className="space-y-3">
                    {d.listings.map((l) => (
                      <li key={l.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/pack/${l.id}`} className="font-medium underline-offset-4 hover:underline">
                              <span className="mr-1" aria-hidden="true">
                                {kindEmoji(l.kind)}
                              </span>
                              {l.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {l.id} · {gen(l.priceAtto)} · window {windowLabel(l.windowSeconds)} · {l.orders} {l.orders === 1 ? "order" : "orders"}
                              {l.stakeKnown ? ` · one slice ${gen(l.sliceAtto)}` : ""}
                            </p>
                            <Tally kept={l.kept} broken={l.broken} unclear={l.unclear} className="mt-1" />
                          </div>
                          <Badge variant="outline">{l.open ? "open" : l.closedReason === "out_of_stake" ? "out of stake" : "closed"}</Badge>
                        </div>
                        <BackingLine l={l} />
                        {l.stakeKnown || isOwner ? (
                          <StakeControls l={l} canAct={isOwner && live} onChanged={() => void state.refresh()} className="border-t pt-2" />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Recent orders</h2>
                {d.orders === null ? (
                  <p className="text-xs text-muted-foreground">The ledger did not answer on this visit. Refresh in a minute; each pack page lists its own orders.</p>
                ) : d.orders.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No orders on this seller&apos;s packs among the latest {LEDGER_ROWS} on the register.</p>
                ) : (
                  <div className="space-y-2">
                    <LedgerTable rows={d.orders} />
                    <p className="text-xs text-muted-foreground">From the latest {LEDGER_ROWS} orders on the register; each pack page lists all of its own.</p>
                  </div>
                )}
              </section>
            </div>
          );
        }}
      </ReadBlock>
    </div>
  );
}
