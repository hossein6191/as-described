import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Lock, ScanSearch, Eye, Users, Coins } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { StatsStrip } from "@/components/stats-strip";
import { HeroCtas, TwinPacks } from "@/components/hero-ctas";
import { StartHere } from "@/components/start-here";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config";

export const metadata: Metadata = { title: { absolute: `${SITE_NAME}: ${SITE_TAGLINE}` } };

const STEPS = [
  {
    step: "1",
    name: "List with promises and a stake",
    description: "The seller commits every section by hash, writes up to six plain-English promises, and puts a stake behind them: one slice of it, half the price, backs each open order.",
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
    description: "If a section breaks a promise, the buyer posts a bond (20% of the price) and reveals that section on chain, text and all.",
    Icon: Eye,
  },
  {
    step: "5",
    name: "Validators decide",
    description: "Studio assigns five validators. Each one that answers in time asks its own model two questions about the section, and code turns the answers into one word: breaks, keeps or unclear.",
    Icon: Users,
  },
  {
    step: "6",
    name: "Money moves by the verdict",
    description: "Breaks: price and bond go back to the buyer, plus one slice of the seller's stake. Keeps: both go to the seller. Unclear: the seller keeps the price and the bond goes back. Nobody can refuse the outcome, and every seller's record is public.",
    Icon: Coins,
  },
];

/** The combining rule in the contract (_combine): the model answers, code decides the word. */
const OUTCOMES = [
  { answers: "yes, no", word: "breaks", tone: "text-breaks", money: "price and bond back to the buyer, plus one slice of the seller's stake" },
  { answers: "no, yes", word: "keeps", tone: "text-keeps", money: "price and bond to the seller" },
  { answers: "anything else", word: "unclear", tone: "text-gold", money: "price to the seller, bond back to the buyer" },
];

const VALIDATOR_STEPS = [
  {
    title: "The evidence is fixed.",
    body: "The disputed section goes on chain and must hash to what the seller committed before the sale, so nobody can swap in other text.",
  },
  {
    title: "Two questions, not one.",
    body: "Each validator asks its own model about that section and that promise twice: does it BREAK the promise? Does it KEEP it? Each answer is yes, no or unclear.",
  },
  {
    title: "Code turns the pair into one word.",
    body: "The model never writes the verdict. Yes then no is breaks, no then yes is keeps, and every other pair (an unclear, or two answers that point the same way) is unclear.",
  },
  {
    title: "Only the word is compared.",
    body: "Studio assigns five validators. Each one that answers in time runs both questions itself and compares only that word with the leader's; the word is stored only when a majority agrees.",
  },
  {
    title: "The money moves in the same transaction.",
    body: "The call that stores the verdict also pays the buyer or the seller, and on breaks one slice of the seller's stake goes to the buyer with it. There is no second step for anyone to refuse.",
  },
];

export default function HomePage() {
  return (
    <div className="container-site space-y-16 py-10 sm:py-16">
      <section className="flex flex-col items-center gap-6 py-6 text-center sm:py-10">
        <LogoMark size={72} className="drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]" />
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance text-white sm:text-5xl">{SITE_TAGLINE}</h1>
        <p className="max-w-2xl text-base text-pretty text-white/80 sm:text-lg">
          Sell a text pack with promises, and put a stake behind them. Buyers pay into escrow. If a section breaks a promise,
          validators on GenLayer judge that one section against that one promise, and the money moves by their verdict, a slice of the
          seller&apos;s stake with it: nobody can refuse a refund, nobody can fake the evidence.
        </p>
        <HeroCtas />
      </section>

      <section
        aria-labelledby="validators-heading"
        className="grid gap-8 rounded-2xl border bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 id="validators-heading" className="text-2xl font-semibold tracking-tight">
              What the validators do
            </h2>
            <p className="text-muted-foreground text-pretty">
              A dispute is one section against one promise. The contract asks GenLayer&apos;s validators, and the verdict they agree on
              settles the escrow.
            </p>
          </div>
          <ol className="space-y-3 text-sm">
            {VALIDATOR_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p>
                  <span className="font-medium text-foreground">{s.title}</span>{" "}
                  <span className="text-muted-foreground">{s.body}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left text-sm">
              <caption className="border-b bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground">
                The two answers (BREAK?, KEEP?), the word code makes of them, and where the money goes
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Answers</th>
                  <th scope="col">Word</th>
                  <th scope="col">Money</th>
                </tr>
              </thead>
              <tbody>
                {OUTCOMES.map((o) => (
                  <tr key={o.word} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">{o.answers}</td>
                    <td className={`px-3 py-2.5 font-semibold ${o.tone}`}>{o.word}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{o.money}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <h3 className="font-semibold">Why this needs GenLayer</h3>
            <p className="text-muted-foreground text-pretty">
              Whether a recipe breaks &ldquo;every recipe is vegetarian&rdquo; is a judgement about English, not a lookup. A normal smart
              contract cannot make it. A server could, but it would be one party&apos;s server, and the other side would have to trust
              it. Here the judgement is reached by validators that each check it on their own model, and the contract that holds the
              money is the one that hears the verdict.
            </p>
          </div>

          <p className="text-xs text-muted-foreground text-pretty">
            Nothing is judged until someone presses Ask the validators on the order. If nobody does within 24 hours of the bond, anyone
            can settle by rule: the seller gets the price and the buyer gets the bond back. A section the buyer reports missing and the
            seller never reveals refunds the price and one slice of the stake, with no model asked.
          </p>
        </div>
      </section>

      <StartHere />

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <span className="text-xs text-muted-foreground">six steps, one wallet is enough to try it</span>
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

      <TwinPacks />
    </div>
  );
}
