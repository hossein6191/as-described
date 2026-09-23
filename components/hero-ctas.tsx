"use client";

// The landing page's calls to action. The hero buttons are static; the "refund you don't deserve"
// block names real listings, so it resolves them on chain: the open listings whose section hashes
// and promises are the vegetarian demo pack and its honest twin. On a register where either one is
// not listed (a visitor's own register, or before the owner lists them) the block is not shown.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { RippleButton } from "@/components/ui/ripple-button";
import { Button } from "@/components/ui/button";
import { demoListings } from "@/components/start-here";
import { useRead } from "@/components/use-read";
import { readAllListings, type Listing, type ReadResult } from "@/lib/chain";
import { gen } from "@/lib/format";

export function HeroCtas() {
  const router = useRouter();
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
      <LiquidButton size="xl" className="w-full text-base sm:w-auto" onClick={() => router.push("/shop")}>
        Open the shop <ArrowRight className="size-4" />
      </LiquidButton>
      <RippleButton className="h-12 w-full sm:w-auto" onClick={() => router.push("/sell")}>
        <PenLine className="size-4" /> Sell a pack
      </RippleButton>
    </div>
  );
}

type Twins = { honest: Listing; broken: Listing } | null;

/** DEMO_PACKS[1] (every promise kept) and DEMO_PACKS[0] (one recipe breaks P1), when both are listed and open. */
async function readTwins(): Promise<ReadResult<Twins>> {
  const all = await readAllListings();
  const found = await demoListings(all.data);
  const honest = found.get(1);
  const broken = found.get(0);
  return { data: honest && broken ? { honest, broken } : null, source: all.source };
}

const link = "text-primary underline-offset-4 hover:underline";

export function TwinPacks() {
  const twins = useRead(readTwins, []);
  const t = twins.data;
  if (!t) return null;
  const { honest, broken } = t;
  return (
    <section className="grid gap-6 rounded-2xl border bg-card p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Try to get a refund you don&apos;t deserve</h2>
        <p className="max-w-2xl text-muted-foreground">
          Demo pack <Link href={`/pack/${honest.id}`} className={link}>{honest.id}</Link> is the honest twin of the vegetarian pack: every
          recipe keeps every promise. Buy it ({gen(honest.priceAtto)}), dispute any section against any promise, and the validators should
          find the promise kept, which sends your price and your bond to the seller. Then buy{" "}
          <Link href={`/pack/${broken.id}`} className={link}>the other one, {broken.id}</Link>, where one recipe quietly breaks a promise:
          find it and dispute it to see the refund.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:items-stretch">
        <Button asChild variant="cool" size="lg">
          <Link href={`/pack/${honest.id}`}>
            Open the honest pack <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={`/pack/${broken.id}`}>Open the pack that breaks a promise</Link>
        </Button>
      </div>
    </section>
  );
}
