import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Lock, ScanSearch, Eye, Users, Coins, ArrowRight } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { StatsStrip } from "@/components/stats-strip";
import { HeroCtas } from "@/components/hero-ctas";
import { Button } from "@/components/ui/button";
import { SITE_TAGLINE } from "@/lib/config";

export const metadata: Metadata = { title: "As Described — Every promise in the listing is enforced." };

const STEPS = [
  {
    step: "1",
    name: "List with promises",
    description: "The seller commits every section by hash and writes up to six plain-English promises about the pack.",
    Icon: ListChecks,
  },
  {
    step: "2",
    name: "Buy into escrow",
    description: "The buyer pays the price into the contract. It stays there for the dispute window the seller chose.",
    Icon: Lock,
  },
  {
    step: "3",
    name: "Read, hashes checked",
    description: "The buyer signs once to fetch the sections. Each one is hashed in the browser and compared with the chain.",
    Icon: ScanSearch,
  },
  {
    step: "4",
    name: "Reveal one section",
    description: "If a section breaks a promise, the buyer posts a bond and reveals that section on chain, text and all.",
    Icon: Eye,
  },
  {
    step: "5",
    name: "Validators decide",
    description: "Five independent validators read the promise and the section and agree on one word: breaks, keeps or unclear.",
    Icon: Users,
  },
  {
    step: "6",
    name: "Money moves by the verdict",
    description: "Breaks: price and bond go back to the buyer. Keeps: both go to the seller. Nobody can refuse the outcome.",
    Icon: Coins,
  },
];

export default function HomePage() {
  return (
    <div className="container-site space-y-16 py-10 sm:py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <LogoMark size={72} className="drop-shadow-[0_8px_30px_rgba(25,198,166,0.35)]" />
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{SITE_TAGLINE}</h1>
        <p className="max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg">
          Sell a text pack with promises. Buyers pay into escrow. If a section breaks a promise, five independent
          validators decide and the money moves by their verdict — nobody can refuse a refund, nobody can fake the
          evidence.
        </p>
        <HeroCtas />
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <span className="text-xs text-muted-foreground">six steps, two wallets</span>
        </div>
        <BentoGrid>
          {STEPS.map((s) => (
            <BentoCard key={s.step} {...s} />
          ))}
        </BentoGrid>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">On chain right now</h2>
          <Link href="/ledger" className="text-sm text-primary underline-offset-4 hover:underline">
            Open the ledger
          </Link>
        </div>
        <StatsStrip />
      </section>

      <section className="grid gap-6 rounded-2xl border bg-card p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Try to get a refund you don&apos;t deserve</h2>
          <p className="max-w-2xl text-muted-foreground">
            The honest twin of the vegetarian pack keeps every promise. Buy it, dispute any section against any
            promise, and watch the validators send your bond to the seller. Then buy the other one and dispute
            recipe 5.
          </p>
        </div>
        <Button asChild variant="cool" size="lg">
          <Link href="/pack/L2">
            Open the honest pack <ArrowRight />
          </Link>
        </Button>
      </section>
    </div>
  );
}
