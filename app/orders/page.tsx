"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { LedgerTable } from "@/components/ledger-table";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tally } from "@/components/ui/product-card";
import { TxRail } from "@/components/tx-rail";
import { WalletGate } from "@/components/wallet-gate";
import { useRead } from "@/components/use-read";
import { useTx, failureOf } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { isMock, readListing, readListingIds, readOrder, readOrdersOfBuyer, type Listing, type Order } from "@/lib/chain";
import { MOCK_BUYER } from "@/lib/chain-mock";
import { gen, kindEmoji, windowLabel } from "@/lib/format";

async function readMine(address: string) {
  const [orderIds, listingIds] = await Promise.all([readOrdersOfBuyer(address), readListingIds()]);
  const orders = (await Promise.all(orderIds.data.map((id) => readOrder(id)))).map((r) => r.data).filter((o): o is Order => !!o);
  const listings = (await Promise.all(listingIds.data.map((id) => readListing(id))))
    .map((r) => r.data)
    .filter((l): l is Listing => !!l && l.seller.toLowerCase() === address.toLowerCase());
  const source = orderIds.source === "snapshot" || listingIds.source === "snapshot" ? "snapshot" : "chain";
  return { data: { orders: orders.reverse(), listings: listings.reverse() }, source } as const;
}

function MyListing({ l, onChanged }: { l: Listing; onChanged: () => void }) {
  const tx = useTx((s) => {
    if (s.applied && !failureOf(s)) onChanged();
  });
  return (
    <li className="rounded-xl border bg-card p-4 text-sm">
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
          </p>
          <Tally kept={l.kept} broken={l.broken} unclear={l.unclear} className="mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{l.open ? "open" : "closed"}</Badge>
          {l.open ? (
            <Button type="button" size="sm" variant="outline" disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start("close_listing", [l.id])}>
              Close listing
            </Button>
          ) : null}
        </div>
      </div>
      {tx.error ? <p className="mt-2 text-xs text-breaks">{tx.error}</p> : null}
      {tx.hash ? (
        <div className="mt-3">
          <TxRail hash={tx.hash} label={`Closing ${l.id}`} onDone={tx.onDone} />
          {tx.final && failureOf(tx.final) ? <p className="mt-2 text-xs text-breaks">{failureOf(tx.final)}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export default function OrdersPage() {
  const w = useWallet();
  // Mock mode has no wallet: show the mock buyer's orders so the page has something to render.
  const address = w.address || (isMock ? MOCK_BUYER : "");
  const state = useRead(() => readMine(address), [address], { enabled: !!address });

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
          <p className="text-muted-foreground">Orders paid by the connected wallet, and the packs it listed.</p>
        </div>
        {address ? (
          <Button type="button" variant="outline" size="sm" onClick={state.retry} disabled={state.loading}>
            <RefreshCw className={state.loading ? "animate-spin" : undefined} /> Refresh
          </Button>
        ) : null}
      </div>

      <WalletGate action="see your orders">
        <ReadBlock
          state={state}
          skeleton={
            <div className="space-y-3">
              <BlockSkeleton lines={2} />
              <BlockSkeleton lines={2} />
            </div>
          }
        >
          {({ orders, listings }) => (
            <div className="space-y-10">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Orders ({orders.length})</h2>
                {orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    This wallet has not bought a pack yet.{" "}
                    <Link href="/shop" className="text-primary underline-offset-4 hover:underline">
                      Open the shop.
                    </Link>
                  </div>
                ) : (
                  <LedgerTable rows={orders} />
                )}
              </section>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Packs you listed ({listings.length})</h2>
                {listings.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Nothing listed from this wallet.{" "}
                    <Link href="/sell" className="text-primary underline-offset-4 hover:underline">
                      Sell a pack.
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {listings.map((l) => (
                      <MyListing key={l.id} l={l} onChanged={() => void state.refresh()} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </ReadBlock>
      </WalletGate>
    </div>
  );
}
