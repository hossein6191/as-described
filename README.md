# As Described

**Every promise in the listing is enforced.**

A shop for small text packs — recipe packs, templates, notes, prompt packs — where the seller's
promises are not marketing copy but conditions on the money. The seller commits every section
of the pack by hash and writes up to six plain-English promises. A buyer pays into escrow. If
one section breaks a promise, the buyer reveals that section on chain; GenLayer validators
independently decide whether it breaks the promise, and the contract moves the money by their
verdict. Nobody can refuse a refund, and nobody can fake the evidence: the revealed text must
hash to what the seller committed before the sale.

- Live site: <https://as-described.vercel.app>
- Register: `0x2f75c3C4854AebF095711510B7075e8f0805966F` on GenLayer Studio, chain 61999 — the
  18 September release. It is being replaced by a register deployed from the current
  `contracts/as_described.py` (sha256 `a72d8640…`, the same bytes the site serves at
  `/contracts/as_described.py`); the address and this line change with it, and every page
  degrades to what the older register answers until then.
- Explorer: <https://explorer-studio.genlayer.com/address/0x2f75c3C4854AebF095711510B7075e8f0805966F>

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
tests/test_pure.py            76 offline tests with a stub runtime; no network
tests/MUTATIONS.md            77 defences removed or inverted one at a time, every mutant killed (tools/mutate.py)
tests/unit/rpc.test.mjs       6 node tests for the site's retry, cooldown and read-cache helpers
tests/on_chain/smoke.mjs      throwaway-account run against Studio; results in tests/on_chain.md
app/, components/, lib/       the Next.js site (shop, pack, order, sell, ledger, orders, deploy)
app/api/packs/[id]/…          the delivery API (signed upload, signed read, status)
docs/                         DESIGN.md · CONTRACTS.md · DECISIONS.md · API.md · BRAND.md
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
(Vercel Blob for uploaded packs; without it the local `.data/` folder is used) and `PACK_SECRET`,
which seals a stored pack at rest with AES-256-GCM. The two go together: a deployment with a Blob
store but no `PACK_SECRET` stores nothing at all rather than keeping paid text in the clear, and
the sell page then offers only the demo packs. The demo packs need no store at any time: a listing
whose committed hashes are exactly a demo pack's is served from the repository.

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

The owner's register, its transactions and the validators' tallies are listed here after the
signing run. Until then the only measured run is the one in `tests/on_chain.md`: 51 checks and 28
signed transactions against a throwaway register deployed from the exact bytes of
`contracts/as_described.py`, with throwaway accounts, by `tests/on_chain/smoke.mjs`. Nothing the
tests touch is the owner's: the smoke run deploys a register of its own, and the browser run
(`tests/site/e2e.mjs`) refuses to start without a `CONTRACT` that is not the one the site ships.

## Limits, stated plainly

- The delivery store is an off-chain trust point: it serves the text the seller uploaded. It is
  bounded on both sides — the browser checks every section against the on-chain hashes, and a
  section that never arrives has a model-free refund path.
- Promises that need world knowledge ("healthy", "the best") will split validators; the sell
  page warns about them. Promises about the section's own text settle.
- One dispute per order. The bond and the "unclear pays the seller" rule put the burden of
  proof on the buyer; there is no appeal round, and the docs say so.
- A missing section costs the seller a reveal. Each section can be reported only once, but a buyer
  who reports every section in turn makes the seller choose, section by section, between putting
  the exact text on chain and losing the price: a section nobody reveals within 24 hours is
  refunded in full by `refund_missing`, which anybody may call. That costs the buyer one purchase
  and holds the escrow for up to 20 × 24 hours, and afterwards the pack is public on chain and
  worth nothing to sell. It is the price of a refund path no model and no site can block, and it
  is stated here rather than patched: a bond on `report_missing` would put a second signature in
  front of every buyer whose pack simply did not arrive.
- Studio is a test network. Transfers land a few seconds after finalization, and the site says
  so instead of showing a balance that has not moved yet.

## Author

Made by Hellish — <https://x.com/Hellishnum1>.
