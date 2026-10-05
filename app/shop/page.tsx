"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine, Plus, ScrollText } from "lucide-react";

import ProductCard from "@/components/ui/product-card";
import { Button } from "@/components/ui/button";
import { StartHere } from "@/components/start-here";
import { CardGridSkeleton, ReadBlock, readEach } from "@/components/read-state";
import { YourRegisterNotice } from "@/components/register-line";
import { useRead } from "@/components/use-read";
import { BackingLine, SellerRecordLine } from "@/components/stake";
import { isMock, readAllListings, readSeller, type Listing, type SellerRecord } from "@/lib/chain";
import { packStatus } from "@/lib/api";
import { isDemoHashes } from "@/lib/demo-keys";
import { DEMO_PACKS } from "@/lib/demo-packs";
import { mockPackUploaded } from "@/lib/chain-mock";
import { DEMO_SELLER } from "@/lib/config";
import { gen } from "@/lib/format";

/** `uploaded` is null when the delivery store never answered: a failed read, not "nothing uploaded". */
type Row = { listing: Listing; uploaded: boolean | null };

/** Below this many open packs the shop says how more get here. */
const FEW_PACKS = 6;
/**
 * Seller records read per visit, one seller() call each, sellers with the most listings first.
 * Studio allows 30 reads a minute; a card past the cap links to its seller's page instead.
 */
const SELLER_READS = 6;
const NO_RECORDS = new Map<string, SellerRecord>();

async function uploadedOf(l: Listing): Promise<boolean | null> {
  if (isMock) return mockPackUploaded(l.id);
  // A demo pack's text ships with the site: no delivery store, no status call.
  if (await isDemoHashes(l.hashes)) return true;
  try {
    // The question is already answered, so the status route must not read this listing again.
    const s = await packStatus(l.id, { demo: false });
    // One 503 from the route must not put "Not delivered yet" on somebody else's delivered pack.
    return s.checked ? s.uploaded : null;
  } catch {
    return null;
  }
}

async function readShop() {
  // One listings read for the whole shelf (paged by the contract), not one read per pack.
  const all = await readAllListings();
  const checks = await readEach(all.data, uploadedOf);
  const rows: Row[] = all.data.map((listing, i) => {
    const c = checks[i];
    return { listing, uploaded: c.status === "fulfilled" ? c.value : null };
  });
  // Open packs first, newest first within each group; closed ones stay visible for their record.
  const order = (r: Row) => (r.listing.open ? 0 : 1);
  const sorted = rows.reverse().sort((a, b) => order(a) - order(b));
  return { data: sorted, source: all.source } as const;
}

/** The sellers whose records the shelf reads: the ones with the most listings on it first, up to SELLER_READS. */
function sellersOf(rows: Row[]): string[] {
  const shelf = new Map<string, number>();
  for (const { listing: l } of rows) shelf.set(l.seller, (shelf.get(l.seller) ?? 0) + 1);
  return [...shelf.keys()].sort((a, b) => shelf.get(b)! - shelf.get(a)!).slice(0, SELLER_READS);
}

/**
 * Seller records for the cards, read once the shelf is on screen: they only fill the "sold · kept ·
 * broken" line, so a slow or rate-limited seller() never holds the cards back. A record that does
 * not answer leaves its cards with the seller link alone.
 */
async function readRecords(sellers: string[]) {
  const reads = await readEach(sellers, (a) => readSeller(a));
  const records = new Map<string, SellerRecord>();
  reads.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.data) records.set(sellers[i], r.value.data);
  });
  return { data: records, source: "chain" } as const;
}

export default function ShopPage() {
  const router = useRouter();
  const state = useRead(readShop, []);
  const sellers = state.data ? sellersOf(state.data) : [];
  const records = useRead(() => readRecords(sellers), [sellers.join(",")], { enabled: sellers.length > 0 });
  const recordOf = records.data ?? NO_RECORDS;
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
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>
              No packs are listed on this register yet.{" "}
              <Link href="/sell" className="text-primary underline-offset-4 hover:underline">
                List the first one
              </Link>
              : any of the {DEMO_PACKS.length} demo packs takes one signature and needs no upload.
            </p>
            <YourRegisterNotice className="justify-center" />
          </div>
        }
      >
        {(rows) => {
          const open = rows.filter((r) => r.listing.open).length;
          const orders = rows.reduce((n, r) => n + r.listing.orders, 0);
          const verdicts = rows.reduce((n, r) => n + r.listing.kept + r.listing.broken + r.listing.unclear, 0);
          return (
            <div className="space-y-4">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {open} open {open === 1 ? "pack" : "packs"} · {orders} {orders === 1 ? "order" : "orders"} so far · {verdicts}{" "}
                  {verdicts === 1 ? "dispute" : "disputes"} settled by the validators
                </span>
                <Link href="/ledger" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                  <ScrollText className="size-3.5" /> Every order is on the ledger
                </Link>
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ listing: l, uploaded }) => {
                  const full = l.open && l.stakeKnown && l.free <= 0;
                  // uploaded === null: the site could not check, so it says nothing about delivery.
                  const badge = !l.open
                    ? l.closedReason === "out_of_stake" ? "Out of stake" : "Closed"
                    : full ? "All slots taken" : uploaded === false ? "Not delivered yet" : uploaded === null ? undefined : l.seller.toLowerCase() === demoSeller ? "Demo" : undefined;
                  const tone = !l.open ? "muted" : full || uploaded === false ? "warn" : "primary";
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
                      details={
                        <>
                          <BackingLine l={l} />
                          <SellerRecordLine address={l.seller} record={recordOf.get(l.seller) ?? null} />
                        </>
                      }
                      buyLabel={l.open && !full ? "Buy" : "View"}
                      onBuy={() => router.push(`/pack/${l.id}`)}
                    />
                  );
                })}
                {open < FEW_PACKS ? <MorePacks /> : null}
              </div>
            </div>
          );
        }}
      </ReadBlock>
    </div>
  );
}

/** The last tile while the shelf is short: where more packs come from, and how to add one. */
function MorePacks() {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-dashed bg-card/40 p-5 text-sm">
      <div className="space-y-2">
        <p className="flex items-center gap-2 font-medium">
          <Plus className="size-4 text-primary" /> Want more to choose from?
        </p>
        <p className="text-muted-foreground">
          Packs appear here as people list them. {DEMO_PACKS.length} demo packs ship with this site (recipes, templates,
          notes, prompts, guides and more), and any wallet can list one in about a minute: its text needs no upload.
        </p>
        <p className="text-muted-foreground">
          A seller cannot buy their own pack, so to try a dispute on a pack you listed, buy it from a second wallet.
        </p>
      </div>
      <Button asChild variant="outline" className="self-start">
        <Link href="/sell">
          <PenLine /> List a demo pack
        </Link>
      </Button>
    </div>
  );
}
