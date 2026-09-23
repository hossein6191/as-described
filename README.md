# As Described

**Every promise in the listing is enforced.**

A shop for small text packs (recipe packs, templates, notes, prompt packs) where the seller's
promises are not marketing copy but conditions on the money. The seller commits every section
of the pack by hash and writes up to six plain-English promises. A buyer pays into escrow. If
one section breaks a promise, the buyer reveals that section on chain; GenLayer validators
independently decide whether it breaks the promise, and the contract moves the money by their
verdict. Nobody can refuse a refund, and nobody can fake the evidence: the revealed text must
hash to what the seller committed before the sale.

- Live site: <https://as-described.vercel.app>
- Register: `0x197478dA434994220368cE3e32179B9409f1509D` on GenLayer Studio, chain 61999, deployed from
  the author's own wallet on 23 September 2026. The source read back from the chain with
  `gen_getContractCode` is byte-identical to `contracts/as_described.py` (sha256
  `eda078db37dcd15ed5efed0e62c35e48d355b12539ec8c2558b74fa0223fe803`), which is also the file the
  site serves at `/contracts/as_described.py` for anyone who wants their own register.
- Explorer: <https://explorer-studio.genlayer.com/address/0x197478dA434994220368cE3e32179B9409f1509D>

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
   same question twice, *does this section break the promise?* and *does this section keep
   the promise?*, and the two answers are combined in code into one word: `breaks`, `keeps` or
   `unclear`. The validator compares only that word with the leader's. Nothing the model wrote
   is stored: the contract builds the sentence the site shows out of the verdict word, the
   section and promise numbers and the amounts, and stores it as `verdict_line`.
5. **Money moves by the verdict.** `breaks`: price and bond go back to the buyer. `keeps`:
   price and bond go to the seller. `unclear`: price to the seller, bond back to the buyer.
   No dispute by the end of the window: anyone may `release` the price to the seller.
6. **A section that never arrived** is a different path with no model at all: the buyer
   reports it, the seller has 24 hours to reveal the text on chain (hash-checked), and if they
   do not, anyone may trigger a full refund.

Every refusal is a signed transaction whose reason is in its receipt on the explorer, and a
refused payable call returns the value in the same transaction. The ledger lists orders, and it
is readable with no wallet.

## Why GenLayer is essential

The question "does this section break this promise?" is a judgement, not a lookup. A normal
smart contract cannot ask it, and a server that could is one party's server. Here Studio
assigns five validators; each one that answers in time reads the same hash-bound text and the
same promise, answers independently, and the money moves when a majority of them agree on the
one verdict word. The evidence cannot move (it must hash to the commitment), the verdict cannot
be pre-written (the contract computes it from two framings that must agree inside each node),
and the consequence is not a note but a transfer.

## How consensus is used

`judge` runs a single non-deterministic block, and everything outside it is ordinary
deterministic code.

- **The leader** asks its model the BREAK question and the KEEP question about the same section
  and the same promise, each answered from the closed set `yes | no | unclear`. Code, not the
  model, combines them: yes/no is `breaks`, no/yes is `keeps`, anything else is `unclear`. The
  block returns three closed tokens, the verdict and the two framing answers, and the leader's
  two framing answers are clamped to the closed set before they reach the receipt.
- **Every validator** runs both framings on its own model and compares only the verdict word
  with the leader's, by exact string equality. It never compares prose, and it never compares
  the framing answers, so an honest disagreement inside one node lands in the value as
  `unclear` rather than in a tolerance.
- **A leader whose round raised** is never agreed with, so the round is retried rather than
  settled. Every rule of the contract is checked in the write method before any model is asked,
  which is why the only error a round can raise is the judge misbehaving.
- **The money moves in the same call** as the verdict is stored. A stored verdict is final, and
  the same (order, section, promise, text) digest is never judged twice.

The tallies are real and they are not unanimous: the runs in `tests/on_chain.md` show 5 agree,
3 agree with 2 idle and 3 agree with 1 disagree and 1 idle, all of them majorities, all of them
applied. A round with no majority stores nothing and may be asked again.

## Repository

```
contracts/as_described.py     the Intelligent Contract (old-SDK runner 1jb45…, Studio 61999)
public/contracts/…            the same file, served by the site's /deploy page (a test keeps them identical)
tests/test_pure.py            84 offline tests with a stub runtime; no network
tests/MUTATIONS.md            83 defences removed or inverted one at a time, every mutant killed (tools/mutate.py)
tests/unit/                   14 node tests for the site's retry, cooldown, read-cache and budget helpers
tests/on_chain/smoke.mjs      throwaway-account run against Studio; results in tests/on_chain.md
tests/site/e2e.mjs            the whole journey through a browser against a throwaway register
app/, components/, lib/       the Next.js site (shop, pack, order, sell, ledger, orders, deploy)
app/api/packs/[id]/…          the delivery API (signed upload, signed read, status)
docs/                         CONTRACTS.md · DECISIONS.md · API.md · BRAND.md
lib/demo-packs.ts             nineteen demo packs, three or more per kind, real content (most with one quiet broken promise)
```

## Running it

```bash
npm install
npm run dev:mock          # the site on http://localhost:3117 with in-memory data, no wallet needed
NEXT_PUBLIC_MOCK=0 NEXT_PUBLIC_CONTRACT=0x… npm run dev   # against a deployed register
npm run build
npm run test:site         # the site's pure helpers, from node
```

Contract tests (Python 3.12, `pip install -r requirements-dev.txt`):

```bash
pytest tests/ -q
genvm-lint check contracts/as_described.py
python tools/mutate.py
```

Environment (see `.env.example`): `NEXT_PUBLIC_CONTRACT` (the register), `BLOB_READ_WRITE_TOKEN`
(a Vercel Blob store for uploaded packs) and `PACK_SECRET`, which seals a stored pack at rest
with AES-256-GCM. The two go together: a deployment with a Blob store but no `PACK_SECRET`
stores nothing at all rather than keeping paid text in the clear, and the sell page then offers
only the demo packs. Without `BLOB_READ_WRITE_TOKEN` the pack falls back to a local `.data/`
folder, which is for development only: a deployed site's filesystem is not durable, so a
deployment that is meant to carry custom packs needs the Blob store and the secret. The demo
packs need no store at any time: a listing whose committed hashes are exactly a demo pack's is
served from the repository.

## Who may do what

| call | who | value |
|---|---|---|
| `list_pack` | anyone, becomes the seller | none |
| `close_listing` | the seller | none |
| `buy` | anyone but the seller, becomes the buyer | exactly the price |
| `open_dispute` | the buyer, before the deadline, once | exactly the bond |
| `withdraw_dispute` | the buyer, while the order is disputed | none |
| `judge` | anyone (the text is bound by hash; the caller cannot steer the verdict) | none |
| `release` | anyone, after the deadline | none |
| `report_missing` | the buyer, before the deadline, at most 3 sections per order | none |
| `reveal` | the seller, within 24 h of the report | none |
| `refund_missing` | anyone, 24 h after the report | none |
| `settle_stale` | anyone, 24 h after a dispute with no stored verdict | none |

A payable call that is refused refunds what it took in the same transaction and returns
`{"ok": false, "reason": …}`; it never raises.

## Evidence

The owner's register, its transactions and the validators' tallies are listed here after the
signing run on the new register. Until then the measured evidence is the run in
`tests/on_chain.md`: 69 checks and 39 signed calls plus the deploy from `tests/on_chain/smoke.mjs`, plus
12 browser steps and 14 more signed transactions from `tests/site/e2e.mjs`, all against a
throwaway register deployed from the exact bytes of `contracts/as_described.py`, with throwaway
accounts. Nothing the tests touch is the owner's: the smoke run deploys a register of its own,
and the browser run refuses to start without a `CONTRACT` that is not the one the site ships.

## Limits, stated plainly

- The delivery store is an off-chain trust point: it serves the text the seller uploaded. It is
  bounded on both sides: the browser checks every section against the on-chain hashes, and a
  section that never arrives has a model-free refund path.
- Promises that need world knowledge ("healthy", "the best") will split validators; the sell
  page warns about them. Promises about the section's own text settle.
- One dispute per order. The bond and the "unclear pays the seller" rule put the burden of
  proof on the buyer; there is no appeal round, and the docs say so. A buyer who disputed a
  section the seller never delivered as committed is not trapped: `withdraw_dispute` returns the
  bond and puts the order back where `report_missing` works, and it grants nothing else, because
  the deadline does not move and the price stays in escrow.
- A missing section costs the seller a reveal, and a buyer may report at most 3 sections per
  order. The cap stops a buyer walking a seller through a whole pack, section by section,
  forcing the choice between publishing everything on chain and losing the price; without it the
  escrow could be held for up to 20 × 24 hours. Three is what an honest buyer needs and no more:
  a pack that never arrived takes one report, the seller cannot reveal what they never had, and
  `refund_missing` returns the whole price to the buyer and may be called by anyone. A section
  already on chain can never be reported again.
- A section longer than the published 4000-character cap cannot be revealed, so on chain it is
  in effect missing and ends in `refund_missing`. In a dispute it is not refused but settled
  `breaks` by rule, with no model asked, because the cap is published and the seller committed
  past it.
- A verdict is what independent runs agreed on, not a truth about the section. Which model the
  validators run is not a fact the contract knows.
- Studio is a test network. Transfers land a few seconds after finalization, and the site says
  so instead of showing a balance that has not moved yet.

## Author

Made by Hellish, <https://x.com/Hellishnum1>. MIT licensed; see `LICENSE`.
