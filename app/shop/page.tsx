"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";

import ProductCard from "@/components/ui/product-card";
import { Button } from "@/components/ui/button";
import { StartHere } from "@/components/start-here";
import { CardGridSkeleton, ReadBlock } from "@/components/read-state";
import { useRead } from "@/components/use-read";
import { isMock, readListing, readListingIds, type Listing } from "@/lib/chain";
import { packStatus } from "@/lib/api";
import { isDemoHashes } from "@/lib/demo-keys";
import { mockPackUploaded } from "@/lib/chain-mock";
import { DEMO_SELLER } from "@/lib/config";
import { gen } from "@/lib/format";

type Row = { listing: Listing; uploaded: boolean };

async function uploadedOf(l: Listing): Promise<boolean> {
  if (isMock) return mockPackUploaded(l.id);
  // A demo pack's text ships with the site: no delivery store, no status call.
  if (await isDemoHashes(l.hashes)) return true;
  try {
    return (await packStatus(l.id)).uploaded;
  } catch {
    return false;
  }
}

async function readShop() {
  const ids = await readListingIds();
  const rows = await Promise.all(
    ids.data.map(async (id) => {
      const l = await readListing(id);
      const uploaded = l.data ? await uploadedOf(l.data) : false;
      return { row: l.data ? { listing: l.data, uploaded } : null, source: l.source };
    }),
  );
  const source = ids.source === "snapshot" || rows.some((r) => r.source === "snapshot") ? "snapshot" : "chain";
  return { data: rows.map((r) => r.row).filter((r): r is Row => r !== null).reverse(), source } as const;
}

export default function ShopPage() {
  const router = useRouter();
  const state = useRead(readShop, []);
  const demoSeller = DEMO_SELLER.toLowerCase();

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
          <p className="text-muted-foreground">Text packs with enforced promises. Prices in test GEN.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/sell">
            <PenLine /> Sell a pack
          </Link>
        </Button>
      </div>

      <StartHere compact />

      <ReadBlock
        state={state}
        skeleton={<CardGridSkeleton count={3} />}
        emptyWhen={(rows) => rows.length === 0}
        empty={
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No packs are listed on this contract yet.{" "}
            <Link href="/sell" className="text-primary underline-offset-4 hover:underline">
              List the first one.
            </Link>
          </div>
        }
      >
        {(rows) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ listing: l, uploaded }) => {
              const badge = !l.open ? "Closed" : !uploaded ? "Not delivered yet" : l.seller.toLowerCase() === demoSeller ? "Demo" : undefined;
              const tone = !l.open ? "muted" : !uploaded ? "warn" : "primary";
              return (
                <ProductCard
                  key={l.id}
                  title={l.title}
                  kind={l.kind}
                  priceLabel={gen(l.priceAtto)}
                  badge={badge}
                  badgeTone={tone}
                  kept={l.kept}
                  broken={l.broken}
                  unclear={l.unclear}
                  meta={`${l.promises.length} ${l.promises.length === 1 ? "promise" : "promises"} · ${l.sectionCount} ${l.sectionCount === 1 ? "section" : "sections"} · ${l.orders} ${l.orders === 1 ? "order" : "orders"}`}
                  buyLabel={l.open ? "Buy" : "View"}
                  onBuy={() => router.push(`/pack/${l.id}`)}
                />
              );
            })}
          </div>
        )}
      </ReadBlock>
    </div>
  );
}
