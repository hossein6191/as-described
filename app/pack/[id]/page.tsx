"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, FileText, Hash } from "lucide-react";

import { Address } from "@/components/address";
import { BuyCard } from "@/components/buy-card";
import { LedgerTable } from "@/components/ledger-table";
import { PromisePills } from "@/components/promise-pills";
import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { TxRail } from "@/components/tx-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tally } from "@/components/ui/product-card";
import { useRead } from "@/components/use-read";
import { failureOf, useTx } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { WalletGate } from "@/components/wallet-gate";
import { isMock, readBondFor, readListing, readOrder, readOrdersOf, type Order } from "@/lib/chain";
import { packStatus } from "@/lib/api";
import { mockPackUploaded } from "@/lib/chain-mock";
import { DEMO_SELLER } from "@/lib/config";
import { gen, kindEmoji, kindGradient, windowLabel } from "@/lib/format";

const bondFallback = (priceAtto: string) => {
  const b = (BigInt(priceAtto) * 20n) / 100n;
  return (b < 10n ** 16n ? 10n ** 16n : b).toString();
};

async function readPackPage(id: string) {
  const l = await readListing(id);
  if (!l.data) return { data: null, source: l.source } as const;
  const [bond, uploaded] = await Promise.all([
    readBondFor(id).catch(() => bondFallback(l.data!.priceAtto)),
    isMock ? Promise.resolve(mockPackUploaded(id)) : packStatus(id).then((s) => s.uploaded).catch(() => false),
  ]);
  return { data: { listing: l.data, bondAtto: bond && bond !== "0" ? bond : bondFallback(l.data.priceAtto), uploaded }, source: l.source } as const;
}

async function readPackOrders(id: string) {
  const ids = await readOrdersOf(id);
  const rows = (await Promise.all(ids.data.map((o) => readOrder(o)))).map((r) => r.data).filter((o): o is Order => !!o);
  return { data: rows.reverse(), source: ids.source } as const;
}

export default function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const w = useWallet();
  const page = useRead(() => readPackPage(id), [id]);
  const orders = useRead(() => readPackOrders(id), [id]);

  const [orderId, setOrderId] = React.useState<string | null>(null);
  const tx = useTx((s, hash) => {
    const r = s.result;
    if (s.applied && r && r.ok === true && typeof r.order === "string") {
      setOrderId(r.order);
      void orders.refresh();
      void page.refresh();
      router.push(`/order/${r.order}?tx=${hash}&new=1`);
    }
  });

  const listing = page.data?.listing ?? null;
  const isSeller = !!listing && !!w.address && listing.seller.toLowerCase() === w.address.toLowerCase();
  // the pay button needs a wallet on Studio; mock mode has neither
  const needsWallet = !isMock && (!w.address || !w.onStudio);

  const pay = async () => {
    if (!listing) return;
    setOrderId(null);
    await tx.start("buy", [listing.id], BigInt(listing.priceAtto));
  };

  return (
    <div className="container-site space-y-8 py-8">
      <ReadBlock
        state={page}
        skeleton={
          <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
            <div className="space-y-4">
              <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <BlockSkeleton lines={3} />
            </div>
            <BlockSkeleton lines={6} />
          </div>
        }
        emptyWhen={(d) => d === null}
        empty={
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            The network answered, and there is no listing called <span className="font-mono">{id}</span> on this contract.{" "}
            <Link href="/shop" className="text-primary underline-offset-4 hover:underline">
              Back to the shop.
            </Link>
          </div>
        }
      >
        {(d) => {
          const l = d!.listing;
          const price = gen(l.priceAtto);
          return (
            <div className="grid min-w-0 gap-8 lg:grid-cols-[1fr_420px]">
              <div className="min-w-0 space-y-6">
                <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundImage: kindGradient(l.kind) }}>
                  <span className="text-7xl drop-shadow-[0_8px_20px_rgba(0,0,0,0.4)] select-none" aria-hidden="true">
                    {kindEmoji(l.kind)}
                  </span>
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {l.seller.toLowerCase() === DEMO_SELLER.toLowerCase() ? <Badge>Demo</Badge> : null}
                    {!l.open ? <Badge variant="secondary">Closed</Badge> : null}
                    {!d!.uploaded ? <Badge className="bg-gold text-black">Not delivered yet</Badge> : null}
                  </div>
                  <span className="absolute right-3 bottom-3 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white/90 capitalize backdrop-blur-sm">
                    {l.kind}
                  </span>
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight text-balance">{l.title}</h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-mono">{l.id}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="size-3.5" /> {l.sectionCount} {l.sectionCount === 1 ? "section" : "sections"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> dispute window {windowLabel(l.windowSeconds)}
                    </span>
                    <Tally kept={l.kept} broken={l.broken} unclear={l.unclear} />
                  </div>
                  <div className="text-sm">
                    <Address value={l.seller} label="Seller" />
                  </div>
                </div>

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Promises</h2>
                  <p className="text-sm text-muted-foreground">
                    Each one is enforced against every section. Dispute a section against a promise and five validators decide.
                  </p>
                  <PromisePills promises={l.promises} />
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Committed sections</h2>
                  <p className="text-sm text-muted-foreground">
                    The seller committed these hashes before any sale. A revealed section must hash to its entry, or the contract refuses it.
                  </p>
                  <ol className="grid gap-1 sm:grid-cols-2">
                    {l.hashes.map((h, i) => (
                      <li key={i} className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        <Hash className="size-3 shrink-0 text-primary" />
                        <span className="shrink-0 text-foreground">{i + 1}</span>
                        <span className="min-w-0 truncate" title={h}>
                          {h}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
                <BuyCard
                  title={l.title}
                  priceLabel={price}
                  bondLabel={gen(d!.bondAtto)}
                  windowText={windowLabel(l.windowSeconds)}
                  payLabel={`Pay ${price}`}
                  onPay={() => void pay()}
                  busy={tx.sending}
                  disabled={!l.open || isSeller || (!!tx.hash && !tx.final)}
                  gate={
                    !l.open ? (
                      <p className="rounded-lg border bg-muted/40 p-3 text-center text-sm text-muted-foreground">This listing is closed. Existing orders continue.</p>
                    ) : isSeller ? (
                      <p className="rounded-lg border bg-muted/40 p-3 text-center text-sm text-muted-foreground">This is your own pack. A seller cannot buy it.</p>
                    ) : needsWallet ? (
                      <WalletGate action="pay">{null}</WalletGate>
                    ) : undefined
                  }
                >
                  {!d!.uploaded && l.open ? (
                    <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
                      The seller has not uploaded the pack contents yet. You can still buy: if a section is missing you report it and get a full refund after 24 hours.
                    </p>
                  ) : null}
                  {tx.error ? <p className="text-sm text-breaks">{tx.error}</p> : null}
                  {tx.hash ? (
                    <div className="space-y-2">
                      <TxRail hash={tx.hash} label={`Paying ${price} into escrow`} onDone={tx.onDone} />
                      {tx.final && failureOf(tx.final) ? (
                        <p className="text-sm text-breaks">{failureOf(tx.final)}</p>
                      ) : null}
                      {orderId ? (
                        <Button asChild variant="cool" className="w-full">
                          <Link href={`/order/${orderId}?tx=${tx.hash}&new=1`}>
                            Open order {orderId} <ArrowRight />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </BuyCard>
              </div>
            </div>
          );
        }}
      </ReadBlock>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orders of this pack</h2>
        {orders.loading && orders.data === null ? (
          <BlockSkeleton lines={2} />
        ) : orders.error && orders.data === null ? (
          <ReadError onRetry={orders.retry} detail={orders.error} compact />
        ) : orders.data && orders.data.length > 0 ? (
          <LedgerTable rows={orders.data} showTitle={false} />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No orders yet.</p>
        )}
      </section>
    </div>
  );
}
