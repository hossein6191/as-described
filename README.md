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

Signed on 23 and 24 September 2026 on GenLayer Studio (chain 61999) by two accounts, **A** the
seller and **B** the buyer; each transaction below names them on the explorer. The calls marked
"anyone" or "a third key" were sent from a throwaway key, because the contract lets anyone make
them; that is the point of those rows. Register
[`0x197478dA434994220368cE3e32179B9409f1509D`](https://explorer-studio.genlayer.com/address/0x197478dA434994220368cE3e32179B9409f1509D).
`gen_getContractCode` on it returns the bytes of `contracts/as_described.py` (sha256
`eda078db37dcd15ed5efed0e62c35e48d355b12539ec8c2558b74fa0223fe803`), which is also the file served
at `/contracts/as_described.py`, and `genvm-lint` passes on the code read back from the chain.

43 calls in all. Every payout was checked against the balances before and after, and every one moved
the exact amount the rule names.

| step | wallet | transaction | votes | result |
|---|---|---|---|---|
| deploy the register | A | [0xc39cef54…](https://explorer-studio.genlayer.com/tx/0xc39cef54a2eb38ce1053ae4e37605146b19dacf18b4f8942aad6a201b4d815b3) | 3 agree, 2 idle | `0x197478dA434994220368cE3e32179B9409f1509D`; the code read back from the chain is byte-identical to `contracts/as_described.py` |
| list ten packs, L1 to L10 | A | [0xc2e69558…](https://explorer-studio.genlayer.com/tx/0xc2e6955874c7a9b57fbaf8c4ae7c3173e64c57eea258ad0521b44c1d92e7cf63) | 3 agree, 2 idle | the first of ten `list_pack` calls, all by A: six kinds, prices 0.5 to 2 GEN, windows 5 minutes to 3 days |
| buy L1, O3 | B | [0x0d4f4da1…](https://explorer-studio.genlayer.com/tx/0x0d4f4da1d27d0a42acc7ad5ad22a5de6e14841fd0ec0a1ea67e3a75c72c23f66) | 5 agree | 1 GEN into escrow |
| dispute O3: recipe 5 against promise 1 | B | [0x0f64b2cd…](https://explorer-studio.genlayer.com/tx/0x0f64b2cd2080ea7ab37ea41e382fc3b753e9f607d0f084c6da49bced8c27a743) | 3 agree, 2 idle | 0.2 GEN bond, the order is `disputed` |
| **judge O3** | anyone | [0xba75fc54…](https://explorer-studio.genlayer.com/tx/0xba75fc548913b8b02de5c8badf3da6d35849a1db9995978749ade9c0cea768f7) | 3 agree, 2 idle | **breaks** (BREAK? yes, KEEP? no): 1.2 GEN to the buyer, balance moved by exactly that |
| judge O3 again | anyone | [0xaae50d14…](https://explorer-studio.genlayer.com/tx/0xaae50d148ae57a6223a3f7bd9fc6afd72928c2cefc85cd4cf2f4186df9e8303b) | 3 agree, 2 idle | refused: the verdict is final |
| **judge O4**, the honest twin | anyone | [0x2c8172b3…](https://explorer-studio.genlayer.com/tx/0x2c8172b3e01f80793a2dbdd23162d2b6f74bbacb4ea63ccea5d27424a0cb87fc) | 3 agree, 2 idle | **keeps** (no, yes): 1.2 GEN to the seller, the same section and promise as O3 on text that keeps it |
| judge O5 with other text | anyone | [0x50f3b621…](https://explorer-studio.genlayer.com/tx/0x50f3b621b30235c0c828e841f563d8558ab6205f56a0dbf53bbe7c27b4785688) | 5 agree | refused before any model ran: the text does not match the committed hash |
| **judge O5**, a promise about the world | anyone | [0x0392bcad…](https://explorer-studio.genlayer.com/tx/0x0392bcad8a12b375573d256415f200862a16ec9a8ba7fada5418b7e8c5a4a8f3) | 3 agree, 1 disagree, 1 idle | **unclear** (unclear, unclear): 1 GEN to the seller, the 0.2 GEN bond back to the buyer. One validator disagreed and the majority decided |
| report section 1 of O6 missing | B | [0x2c36528b…](https://explorer-studio.genlayer.com/tx/0x2c36528b32b375f72265da808d78cf45a7e4f5aaa39fe4b549fd667fa4db487d) | 3 agree, 2 idle | `missing`, the seller has 24 hours, 2 reports left |
| reveal the wrong text | A | [0x489f2eb9…](https://explorer-studio.genlayer.com/tx/0x489f2eb97e953ab08db4545eea77fdfb1409f1d1d8099579bf1eb37cdd3009b8) | 3 agree, 2 idle | refused: the text does not match the hash committed for section 1 |
| reveal section 1 of O6 | A | [0x97a8f7c8…](https://explorer-studio.genlayer.com/tx/0x97a8f7c8ace20ca8f39ac39e58e9ad5399bdd249835ad67748fd582d001b4c4d) | 3 agree, 2 idle | 575 characters on chain; the order is `paid` again and the section is readable with no wallet |
| report that section again | B | [0x496aa54c…](https://explorer-studio.genlayer.com/tx/0x496aa54c8b41f33b3bf59411109d8c9d88115bc6c41a43c3a1a59a8f63c13884) | 5 agree | refused: section 1 is already on chain, so the deadline cannot be pushed out twice for it |
| release O7 before the window closed | anyone | [0x20437937…](https://explorer-studio.genlayer.com/tx/0x204379379d5b99c1747906dbfb112d4daa6d63394ea8472015513fdaa6f077c8) | 3 agree, 2 idle | refused: the window is open until the stated time |
| release O7 after it closed | anyone | [0xd0a60b0e…](https://explorer-studio.genlayer.com/tx/0xd0a60b0e003f536fc372f9eabf49561342112b6d8e0222bbbbfb7e2a83c919a6) | 3 agree, 2 idle | 0.5 GEN to the seller, no dispute and no model |
| settle O1 by rule, too early | anyone | [0x8ad43ee8…](https://explorer-studio.genlayer.com/tx/0x8ad43ee8a80963e17ec3896e6f1e1fcd6c118aedcbc209b80b09bd8a2030313c) | 3 agree, 2 idle | refused: a dispute may be settled by rule 24 hours after it was opened |
| **settle O1 by rule**, a day later | anyone | [0xaa95a628…](https://explorer-studio.genlayer.com/tx/0xaa95a6285b39d6e75537690f9d3ce6d643bf8628c218fd7058b41fcd4aeb2e20) | 3 agree, 2 idle | nobody asked for a verdict in 24 hours: 1 GEN to the seller, the 0.2 GEN bond back to the buyer |
| refund O2, too early | anyone | [0xa7c864a7…](https://explorer-studio.genlayer.com/tx/0xa7c864a70ddb6c82750441c84d42e36b47266c06bef7c4b5fd73e69da185c607) | 3 agree, 2 idle | refused: the seller has 24 hours from the report |
| **refund O2**, a day later | anyone | [0xb07d2b47…](https://explorer-studio.genlayer.com/tx/0xb07d2b47c825b73a483a7721cf50a932827e8152b87e9e498084bcf26bea7f0f) | 5 agree | the section was never revealed: the whole 0.5 GEN back to the buyer, no model asked |
| a stranger disputes O6 | a third key | [0x78b90591…](https://explorer-studio.genlayer.com/tx/0x78b9059184060348e13f52738184e99fbb0e708993de2cfc10a118794b6b37df) | 3 agree, 2 idle | refused and refunded in the same transaction: only the buyer may dispute |
| buy L1 with the wrong amount | a third key | [0x728e637a…](https://explorer-studio.genlayer.com/tx/0x728e637a240db0a6fbcc85fcc231831a8d18b3e45a6d888b56bc79fb62c7138d) | 3 agree, 2 idle | refused and refunded: send exactly the price |
| the seller buys their own pack | A | [0x9db68bae…](https://explorer-studio.genlayer.com/tx/0x9db68baebd35736b21a6d968deb331187eae2441854f6f5cec45a67e2c28254f) | 5 agree | refused and refunded |
| close L4, then buy it | A, then a third key | [0x1e950d11…](https://explorer-studio.genlayer.com/tx/0x1e950d11e9f0ca65ee24674a0691ee6ed5712757300d74b6e30c085bb6f9a4af) | 5 agree | refused and refunded: the listing is closed (`close_listing` [0x1d8a630c…](https://explorer-studio.genlayer.com/tx/0x1d8a630c26d7f67ebc3f2b87c791291bc2a606d4e44f552b43fa0e66837099a8)) |

Read back from the register afterwards: `stats()` is 10 listings, 7 orders, 1 kept, 1 broken,
1 unclear, 1 refunded, 1 released, 1 stale. Every finished order carries the sentence the contract
wrote, for example O5's: "The validators did not reach a clear answer on whether section 5 breaks
promise 1, so the seller got the price (1 GEN) and the buyer got the bond back (0.2 GEN)." The same
ten packs and seven orders are in `data/snapshot.json`, the labelled fallback the site shows when
Studio answers nothing (`node tools/snapshot.mjs` retakes it).

Three verdicts came from the same pair of questions on the same section number: **breaks** on a pack
whose recipe 5 fries bacon under "every recipe is vegetarian", **keeps** on its honest twin, and
**unclear** on a pack that promises every recipe "was tested three times before publishing", which no
section can settle either way. Nothing the model wrote is stored: the contract keeps the word and
writes the sentence.

The tests that ran before any of this are in `tests/on_chain.md`: 69 checks over 39 signed calls
against a throwaway register with the same bytes, and 12 browser steps with 14 more transactions from
`tests/site/e2e.mjs`. Nothing there touches the register above.

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

## Licence

MIT; see `LICENSE`.
