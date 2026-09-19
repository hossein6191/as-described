# As Described

**Every promise in the listing is enforced.**

A shop for small text packs — recipe packs, templates, notes, prompt packs — where the seller's
promises are not marketing copy but conditions on the money. The seller commits every section
of the pack by hash and writes up to six plain-English promises. A buyer pays into escrow. If
one section breaks a promise, the buyer reveals that section on chain; GenLayer validators
independently decide whether it breaks the promise, and the contract moves the money by their
verdict. Nobody can refuse a refund, and nobody can fake the evidence: the revealed text must
hash to what the seller committed before the sale.

- Live site: _(filled in after the owner deploys)_
- Contract: _(one address, on GenLayer Studio, chain 61999 — filled in after the owner deploys)_
- Explorer: <https://explorer-studio.genlayer.com>

Built on GenLayer Studio (chain 61999). Test GEN only, no real money.

## How it works

1. **List with promises.** The seller writes the sections, the site hashes each one (sha256 of
   the exact bytes), and `list_pack` puts the title, the promises, the hashes, the price and the
   dispute window on chain. Only then does the seller upload the text to the delivery store,
   with a wallet signature bound to the hash manifest.
2. **Buy into escrow.** `buy` takes exactly the price and holds it. The buyer signs once to
   fetch the sections; the browser hashes each one and shows whether it matches the commitment.
3. **Reveal one section.** The buyer picks the section and the promise it breaks, posts a bond
   (20 % of the price) with `open_dispute`, then `judge` carries the section text on chain. The
   contract checks the hash first; text that was not committed is refused before any model runs.
4. **Validators decide.** Inside one consensus block every validator asks its own model the
   same question twice — *does this section break the promise?* and *does this section keep
   the promise?* — and the two answers are combined in code into one word: `breaks`, `keeps` or
   `unclear`. The validator compares only that word with the leader's. Nothing the model wrote
   is stored; the contract writes the sentence.
5. **Money moves by the verdict.** `breaks`: price and bond go back to the buyer. `keeps`:
   price and bond go to the seller. `unclear`: price to the seller, bond back to the buyer.
   No dispute by the end of the window: anyone may `release` the price to the seller.
6. **A section that never arrived** is a different path with no model at all: the buyer
   reports it, the seller has 24 hours to reveal the text on chain (hash-checked), and if they
   do not, anyone may trigger a full refund.

Every path leaves a row on chain, including the refusals, and the ledger is readable with no
wallet.

## Why GenLayer is essential

The question "does this section break this promise?" is a judgement, not a lookup. A normal
smart contract cannot ask it, and a server that could is one party's server. Here five
validators each read the same hash-bound text and the same promise, answer independently, and
the money moves only when they agree. The evidence cannot move (it must hash to the
commitment), the verdict cannot be pre-written (the contract computes it from two framings
that must agree), and the consequence is not a note but a transfer.

## Repository

```
contracts/as_described.py     the Intelligent Contract (old-SDK runner 1jb45…, Studio 61999)
public/contracts/…            the same file, served by the site's /deploy page (a test keeps them identical)
tests/test_pure.py            45 offline tests with a stub runtime; no network
tests/MUTATIONS.md            50 defences removed one at a time, every mutant killed (tools/mutate.py)
tests/on_chain/smoke.mjs      throwaway-account run against Studio; results in tests/on_chain.md
app/, components/, lib/       the Next.js site (shop, pack, order, sell, ledger, orders, deploy)
app/api/packs/[id]/…          the delivery API (signed upload, signed read, status)
docs/                         DESIGN.md · CONTRACTS.md · DECISIONS.md · API.md · BRAND.md
lib/demo-packs.ts             the three demo packs, real content
```

## Running it

```bash
npm install
npm run dev:mock          # the site on http://localhost:3117 with in-memory data, no wallet needed
NEXT_PUBLIC_MOCK=0 NEXT_PUBLIC_CONTRACT=0x… npm run dev   # against a deployed register
npm run build
```

Contract tests (Python 3.12, `pip install -r requirements-dev.txt`):

```bash
pytest tests/ -q
genvm-lint check contracts/as_described.py
python tools/mutate.py
```

Environment (see `.env.example`): `NEXT_PUBLIC_CONTRACT` (the register), `BLOB_READ_WRITE_TOKEN`
(Vercel Blob for uploaded packs; without it the local `.data/` folder is used), `PACK_SECRET`
(packs are encrypted at rest with a key derived from it). The demo packs need no store:
a listing whose committed hashes are exactly a demo pack's is served from the repository.

## Who may do what

| call | who | value |
|---|---|---|
| `list_pack` | anyone, becomes the seller | — |
| `close_listing` | the seller | — |
| `buy` | anyone but the seller, becomes the buyer | exactly the price |
| `open_dispute` | the buyer, before the deadline, once | exactly the bond |
| `judge` | anyone (the text is bound by hash; the caller cannot steer the verdict) | — |
| `release` | anyone, after the deadline | — |
| `report_missing` | the buyer, before the deadline | — |
| `reveal` | the seller, within 24 h of the report | — |
| `refund_missing` | anyone, 24 h after the report | — |
| `settle_stale` | anyone, 24 h after a dispute with no stored verdict | — |

A payable call that is refused refunds what it took in the same transaction and records the
refusal; it never raises.

## Evidence

The owner's deployment, its transactions and the validators' tallies are listed here after the
signing run. The throwaway run used while building is in `tests/on_chain.md`.

## Limits, stated plainly

- The delivery store is an off-chain trust point: it serves the text the seller uploaded. It is
  bounded on both sides — the browser checks every section against the on-chain hashes, and a
  section that never arrives has a model-free refund path.
- Promises that need world knowledge ("healthy", "the best") will split validators; the sell
  page warns about them. Promises about the section's own text settle.
- One dispute per order. The bond and the "unclear pays the seller" rule put the burden of
  proof on the buyer; there is no appeal round, and the docs say so.
- Studio is a test network. Transfers land a few seconds after finalization, and the site says
  so instead of showing a balance that has not moved yet.

## Author

Made by Hellish — <https://x.com/Hellishnum1>.
