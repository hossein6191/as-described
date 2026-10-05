# As Described

**Every promise in the listing is enforced.**

A shop for small text packs (recipe packs, templates, notes, prompt packs) where the seller's
promises are not marketing copy but conditions on the money. The seller commits every section
of the pack by hash and writes up to six plain-English promises. A buyer pays into escrow. If
one section breaks a promise, the buyer reveals that section on chain; GenLayer validators
independently decide whether it breaks the promise, and the contract moves the money by their
verdict. Nobody can refuse a refund, and nobody can fake the evidence: the revealed text must
hash to what the seller committed before the sale. And the seller stands behind every promise
with a stake: a broken promise pays the buyer a slice of it, and every seller's record is public
on chain.

- Live site: <https://as-described.vercel.app>
- Version 2 (this repository): register `0xE31e77984bce5623AB50c7CB5530a030B9173718` on GenLayer
  Studio, chain 61999, deployed on 5 October 2026 from the current `contracts/as_described.py`
  (the file the site serves at `/contracts/as_described.py` for anyone who wants their own
  register). `gen_getContractCode` returns it byte for byte (sha256
  `1b46d8babe20e105cc86f82d3ebdc3612bb7f67570d906a175800212a1cb3adf`). Its run is under
  [Evidence for version 2](#evidence-for-version-2).
  Explorer: <https://explorer-studio.genlayer.com/address/0xE31e77984bce5623AB50c7CB5530a030B9173718>
- Version 1, the accepted version (commit `11aeb18`): register
  `0x197478dA434994220368cE3e32179B9409f1509D` on GenLayer Studio, chain 61999, deployed from the
  author's own wallet on 23 September 2026. The source read back from the chain with
  `gen_getContractCode` is byte-identical to `contracts/as_described.py` at that commit (sha256
  `eda078db37dcd15ed5efed0e62c35e48d355b12539ec8c2558b74fa0223fe803`). It stays readable on the
  explorer as the accepted version, and the site still reads it: a register from before stakes
  shows no stake, never a stake of zero, and the delivery API still accepts its code.
  Explorer: <https://explorer-studio.genlayer.com/address/0x197478dA434994220368cE3e32179B9409f1509D>

Built on GenLayer Studio (chain 61999). Test GEN only, no real money.

## Version 2: the seller stands behind the promises

Everything in this section is new since the accepted version, commit `11aeb18`; `git diff 11aeb18`
shows all of it.

**The weakness it fixes.** In version 1 all the risk sat with the buyer. To dispute, the buyer
posts a bond of 20 % of the price and loses it on `keeps`. A seller who broke a promise lost only
that one sale: the buyer got the price and the bond back and the seller ended where they would
have been without listing at all. Listing a pack that did not match its promises was a free
option, and nothing on chain told the next buyer how a seller had done before.

**What version 2 does about it.**

1. **A stake behind every promise.** `list_pack` is now payable: the value sent is the listing's
   stake, at least one *slice*, which is half the price. Each open order (`paid`, `disputed` or
   `missing`) holds one slice, so a listing takes `stake ÷ slice` open orders at a time, and every
   buyer has a whole slice behind them for as long as their order is open. The contract keeps
   `stake >= open_orders × slice` on every listing after every call.
2. **A broken promise costs the seller.** A `breaks` verdict, by the validators or by rule on an
   oversize section, pays the buyer the price, the bond **and one slice of the stake**, in one
   transfer. A section the buyer reported missing and the seller never revealed (`refund_missing`)
   pays the price plus one slice. `keeps`, `unclear`, `release` and `settle_stale` never touch the
   stake. A listing left with less than one slice closes itself (`closed_reason: out_of_stake`).
3. **Every seller's record is public.** A new view, `seller(address)`, answers what the address
   listed, sold, released, kept, broke, left unclear, had refunded and had settled stale, what its
   stakes hold now and what they have paid buyers. The record is written in the same calls that
   move the money, so it cannot drift from the orders. The site shows it on every pack and on a
   new seller page.
4. **Any website can show and sell a listing.** An iframe card, an SVG badge and public JSON,
   below. Buying still happens on this site, in a new tab.

A worked example. A pack costs 1 GEN and the seller lists it with a stake of 1 GEN: two slices of
0.5 GEN, so two buyers can hold orders at once and a third is refused, with the price returned,
until one of them ends. The validators find that a section breaks a promise: that buyer gets
1 GEN + 0.2 GEN bond + 0.5 GEN from the stake = 1.7 GEN, and the contract's own sentence says so
("…so the buyer got the price, the bond and one slice of the seller's stake (0.5 GEN) back:
1.7 GEN."). The stake is now 0.5 GEN, one slice, so the listing serves one buyer at a time. A
second broken promise takes the last slice and the listing closes itself. The seller's record now
reads 2 broken and 1 GEN paid to buyers, for anyone to read.

### The contract, what changed

| | version 2 |
|---|---|
| constant | `STAKE_SLICE_PERCENT = 50`: one slice is half the price, fixed on the listing when it is listed |
| `list_pack(title, kind, promises_json, hashes_json, price_atto, window_seconds)` | now `@gl.public.write.payable`; the value is the stake, at least one slice. Every refusal, the old field checks included, refunds and returns `{"ok": false, "reason": "…; your funds were returned", "returned": "<atto>"}`; it never raises after taking value. Success adds `stake`, `slice` and `capacity` |
| `buy(listing_id)` | refused, and refunded, while every slice backs an open order: "this listing's stake backs 2 open orders at a time and all 2 are taken; try again when one ends". Every refusal now says how much came back (`returned`) |
| `judge`, `refund_missing` | the slash: one slice from the listing's stake to the buyer, in the same transfer; both return `paid_from_stake` |
| `close_listing(listing_id)` | with no order open, the whole stake comes back in the same call; otherwise it stays behind the open orders. Returns `returned` and `open_orders` |
| `withdraw_stake(listing_id)` | **new**. The seller, once the listing is closed and no order is open: what is left of the stake goes back |
| `seller(address_hex)` | **new view**. `{seller, known, listings, listed, sold, released, kept, broken, unclear, refunded, stale, staked, stake_paid, first_listed}`; an address that never listed answers `known: false` and zeros |
| listing rows (`listing`, `listings`) | add `stake`, `slice`, `open_orders`, `capacity`, `free`, `stake_paid`, `closed_reason` (`""`, `seller` or `out_of_stake`) |
| order and ledger rows | add `paid_from_stake`, the part of `paid_buyer` that came from the seller's stake |
| `stats()` | adds `stake_held`, `stake_paid` and `sellers` |
| `rules()` | publishes the stake, the slice, capacity, the slash, the self-close and close/withdraw |
| storage | appended at the end, never reordered: `Listing.stake`, `slice`, `open_orders`, `stake_paid`, `closed_reason`; `Order.paid_from_stake`; a new `SellerRecord` dataclass of scalars only; contract fields `sellers`, `listings_by_seller`, `seller_count`, `stake_held_total`, `stake_paid_total` |
| hardening | `list_pack`, `buy` and `open_dispute` read an argument that is not a string as a refusal with a refund, never a crash that strands the value; caller JSON with a fraction, an exponent, `NaN` or `Infinity` is refused before a float is built, because floats trap the VM |

Unchanged from version 1: the hash commitments, the judge round and its two framings, the
fences, the judged digests, the missing and reveal path, `withdraw_dispute` and the clock rules.
Why each new rule is what it is (why the seller stakes, why a slice is half the price, why
capacity, why `refund_missing` slashes and `keeps`, `unclear` and stale do not, why closing
returns the stake only when nothing is open) is in `docs/DECISIONS.md`.

### The site, what changed

- **Sell:** a stake field that defaults to two slices (the price), with one-click 1, 2 and 4 slices,
  checked against one slice and the wallet's balance; the button reads "List for 1 GEN · stake
  1 GEN", and a refusal shows the reason and how much came back.
- **Shop and pack pages:** "Backed by 1.5 GEN · 2 more buyers can be covered now", the seller's
  record, and "All slots taken" or "Out of stake" in place of a buy the contract would refuse.
- **Seller page, `/seller/<address>`:** the record, the stake held and paid out, the seller's
  listings and recent orders, and for the seller their own Close and Withdraw controls (also on
  My orders).
- **Order page, ledger, stats:** the slice behind an open order, the part of each payout that came
  from a stake, and the stake held, paid out and the number of sellers.
- A register deployed before version 2, the accepted one included, is still read correctly, and
  listing on it sends no stake.

### Sell it anywhere: the card, the badge and the JSON

Every pack page has a "Sell it anywhere" box with these snippets filled in. `L1` stands for any
listing id. All three read the site's own register on the server, are read-only and need no
wallet, and are refreshed about once a minute (while Studio is busy, an answer up to ten minutes
old stands in, marked stale). Buying happens on this site in a new tab, because a wallet does not
connect inside another site's frame. `/embed/*` is the only path another site may frame.

A card, 380 × 440: title, price, promises, the stake behind them, the seller's record and a buy
button.

```html
<iframe src="https://as-described.vercel.app/embed/L1" title="L1 on As Described" width="380" height="440" style="border:0;border-radius:16px;max-width:100%" loading="lazy"></iframe>
```

A badge for a README or a forum post: "As Described | 2 sold · 1 broken · 1.5 GEN staked · 0.5 GEN
paid to buyers", teal while every promise held, orange once one broke or the stake paid a
buyer, grey once the listing is closed.

```markdown
[![As Described](https://as-described.vercel.app/api/badge/L1)](https://as-described.vercel.app/pack/L1)
```

The listing and its seller's record as JSON, CORS `*`, fields named as the contract's views name
them, amounts in atto as decimal strings:

```bash
curl -s https://as-described.vercel.app/api/listing/L1
```

```json
{
  "ok": true,
  "register": "0x…",
  "chain_id": 61999,
  "read_at": "2026-10-05T09:00:00.000Z",
  "stale_read": false,
  "listing": {
    "listing": "L1", "title": "Weeknight Vegetarian, 8 recipes", "kind": "recipes", "seller": "0x…",
    "price": "1000000000000000000", "bond": "200000000000000000",
    "promises": ["…"], "hashes": ["…"], "section_count": 8, "window_seconds": 259200,
    "created_at": "…", "open": true, "closed_reason": "",
    "orders": 2, "kept": 0, "broken": 1, "unclear": 0,
    "stakes": true, "stake": "1500000000000000000", "slice": "500000000000000000",
    "open_orders": 1, "capacity": 3, "free": 2, "stake_paid": "500000000000000000"
  },
  "seller": {
    "seller": "0x…", "known": true, "listings": ["L1", "L2"], "listed": 2, "sold": 4,
    "released": 0, "kept": 1, "broken": 1, "unclear": 0, "refunded": 0, "stale": 0,
    "staked": "2500000000000000000", "stake_paid": "500000000000000000", "first_listed": "…"
  },
  "links": {
    "pack": "https://as-described.vercel.app/pack/L1",
    "embed": "https://as-described.vercel.app/embed/L1",
    "badge": "https://as-described.vercel.app/api/badge/L1",
    "seller": "https://as-described.vercel.app/seller/0x…"
  }
}
```

`400` for an id that is not a listing id, `404` for one the register does not hold, `503` with a
`reason` when nothing could be read. The budgets and caching are in `docs/API.md`.

### Checks for version 2

| check | version 1 | version 2 |
|---|---|---|
| `pytest tests/ -q`, offline with a stub runtime | 84 tests | 98 tests, among them seeded random journeys of 400 steps through every write that check, after each step, that every atto the contract holds is a stake, an open order's price or a bond, that every open order has a whole slice behind it, and that every seller record and total matches the orders |
| `tools/mutate.py`, defences removed or inverted one at a time | 83, all killed | 151, all killed (`tests/MUTATIONS.md`) |
| `genvm-lint check contracts/as_described.py` | passes | passes |
| site: `tsc`, `eslint`, node unit tests, `next build` | 14 unit tests | 19 unit tests (the badge and the public-read budget among them); every route renders in mock mode |
| `tests/on_chain/smoke.mjs` on Studio | run | extended for the stake: a refused listing returns its stake, `breaks` pays 1.7 GEN on a 1 GEN pack listed with one slice and that listing closes itself out of stake, a third order is refused while two are open, close with an order open keeps the stake and `withdraw_stake` returns it after, close with nothing open returns it at once, and the seller record and the stake totals match the run. 86 passed, 0 failed on 5 October 2026: [Evidence for version 2](#evidence-for-version-2) |

## How it works

1. **List with promises and a stake.** The seller writes the sections, the site hashes each one
   (sha256 of the exact bytes), and `list_pack` puts the title, the promises, the hashes, the
   price and the dispute window on chain, with the seller's stake as the value of the call: at
   least one slice (half the price), and each slice backs one open order. Only then does the
   seller upload the text to the delivery store, with a wallet signature bound to the hash
   manifest.
2. **Buy into escrow.** `buy` takes exactly the price and holds it, and the order holds one
   slice of the seller's stake until it ends; while every slice is taken, a buy is refused and
   the price comes back. The buyer signs once to fetch the sections; the browser hashes each one
   and shows whether it matches the commitment.
3. **Reveal one section.** The buyer picks the section and the promise it breaks, posts a bond
   (20 % of the price) with `open_dispute`, then `judge` carries the section text on chain. The
   contract checks the hash first; text that was not committed is refused before any model runs.
4. **Validators decide.** Inside one consensus block every validator asks its own model the
   same question twice, *does this section break the promise?* and *does this section keep
   the promise?*, and the two answers are combined in code into one word: `breaks`, `keeps` or
   `unclear`. The validator compares only that word with the leader's. Nothing the model wrote
   is stored: the contract builds the sentence the site shows out of the verdict word, the
   section and promise numbers and the amounts, and stores it as `verdict_line`.
5. **Money moves by the verdict.** `breaks`: price and bond go back to the buyer, plus one
   slice of the seller's stake. `keeps`: price and bond go to the seller. `unclear`: price to
   the seller, bond back to the buyer. No dispute by the end of the window: anyone may `release`
   the price to the seller.
6. **A section that never arrived** is a different path with no model at all: the buyer
   reports it, the seller has 24 hours to reveal the text on chain (hash-checked), and if they
   do not, anyone may trigger a full refund, plus one slice of the seller's stake.
7. **The record and the stake.** Every outcome is added to the seller's public record in the
   same call. A listing whose stake falls below one slice closes itself; a seller who closes a
   listing gets the stake back in the same call when no order is open, or with `withdraw_stake`
   once the last one has ended.

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
tests/test_pure.py            98 offline tests with a stub runtime; no network
tests/MUTATIONS.md            151 defences removed or inverted one at a time, every mutant killed (tools/mutate.py)
tests/unit/                   19 node tests for the site's retry, cooldown, read-cache and budget helpers, and the badge
tests/on_chain/smoke.mjs      throwaway-account run against Studio; results in tests/on_chain.md
tests/site/e2e.mjs            the whole journey through a browser against a throwaway register
app/, components/, lib/       the Next.js site (shop, pack, order, sell, ledger, orders, seller, deploy)
app/api/packs/[id]/…          the delivery API (signed upload, signed read, status)
app/embed/[id], app/api/badge/[id], app/api/listing/[id]
                              a listing for other websites: an iframe card, an SVG badge, public JSON (docs/API.md)
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
| `list_pack` | anyone, becomes the seller | the stake: at least one slice, half the price |
| `close_listing` | the seller; the stake comes back in the same call when no order is open | none |
| `withdraw_stake` | the seller, once the listing is closed and no order is open | none |
| `buy` | anyone but the seller, becomes the buyer, while a slice of the stake is free | exactly the price |
| `open_dispute` | the buyer, before the deadline, once | exactly the bond |
| `withdraw_dispute` | the buyer, while the order is disputed | none |
| `judge` | anyone (the text is bound by hash; the caller cannot steer the verdict) | none |
| `release` | anyone, after the deadline | none |
| `report_missing` | the buyer, before the deadline, at most 3 sections per order | none |
| `reveal` | the seller, within 24 h of the report | none |
| `refund_missing` | anyone, 24 h after the report | none |
| `settle_stale` | anyone, 24 h after a dispute with no stored verdict | none |

A payable call that is refused (`list_pack`, `buy`, `open_dispute`) refunds what it took in the
same transaction and returns `{"ok": false, "reason": …}`, with `"returned"` on `list_pack` and
`buy`; it never raises.

Where the money goes:

| outcome | to the buyer | to the seller | the listing's stake |
|---|---|---|---|
| `breaks`, by the validators or by rule | price + bond + one slice | nothing | one slice less |
| `keeps` | nothing | price + bond | untouched |
| `unclear` | bond | price | untouched |
| `released`, no dispute in the window | nothing | price | untouched |
| `refunded`, a reported section never revealed | price + one slice | nothing | one slice less |
| `settled_stale`, no verdict 24 h after a dispute | bond | price | untouched |
| `close_listing` with no order open | | the whole stake | 0 |
| `withdraw_stake` | | what is left | 0 |

## Evidence for version 2

Run on 5 October 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, which
deploys its own register from `contracts/as_described.py` and signs from three throwaway keys:
a seller, a buyer and a stranger for the calls only a stranger should be refused. **86 checks
passed, 0 failed**; the whole log is `tests/on_chain/smoke-v2.log`. Register
[`0xE31e77984bce5623AB50c7CB5530a030B9173718`](https://explorer-studio.genlayer.com/address/0xE31e77984bce5623AB50c7CB5530a030B9173718),
whose `gen_getContractCode` hashes to the repository file
(`1b46d8babe20e105cc86f82d3ebdc3612bb7f67570d906a175800212a1cb3adf`). Every payout was read from
the balances before and after finalisation, and every final order was checked for the sentence
the contract wrote. The calls that are new in version 2:

| call | transaction | result |
|---|---|---|
| deploy the version 2 register | [0x0563fede…](https://explorer-studio.genlayer.com/tx/0x0563fede73c2ee1b8e6a4719a78464e7b078624bde9575eb9ce1976ef453859e) | `0xE31e7798…3718`, code byte-identical to the repository |
| a stake below one slice (half the price) is refused | [0xdb1ef0eb…](https://explorer-studio.genlayer.com/tx/0xdb1ef0ebf53188506a405db8e5f7a19ad97a4aa7ebd8eb35e7bb853feee33d61) | `ok: false`, the stake came back in the same call |
| list pack 1 with the minimum stake, one slice | [0x29ffc29d…](https://explorer-studio.genlayer.com/tx/0x29ffc29d03f23a61b78e04a1eb520b11589edab399f2012e61f1d37737cb104a) | L1: stake 0.5 GEN, slice 0.5 GEN, capacity 1 |
| buy pack 1 | [0x55fddf56…](https://explorer-studio.genlayer.com/tx/0x55fddf56730793a75f99ec1e050532be1b728a3a7aa7e4d5f3311250498d2991) | O1, 1 GEN in escrow |
| dispute recipe 5 against "every recipe is vegetarian" | [0x94d509da…](https://explorer-studio.genlayer.com/tx/0x94d509da3515bb055b82b7f79b3bac1f4105f52678c8ad975e973841abd186fa) | bond 0.2 GEN |
| judge: the validators read recipe 5 | [0x90d85c2b…](https://explorer-studio.genlayer.com/tx/0x90d85c2be17b89a798d32efba4e5de3ee5ba4a14830d5601bfea27d33a4da272) | `breaks`, 3 agree; the buyer got **1.7 GEN**: price, bond and one 0.5 GEN slice of the seller's stake; L1 had no slice left and **closed itself** (`out_of_stake`) |
| buy pack 1 again | [0x02592b6d…](https://explorer-studio.genlayer.com/tx/0x02592b6d6218d42319e0cd1baba66315484aeb0c9849587955331aa8c0941c3b) | refused, the listing is out of stake; the price came back |
| close pack 4 while its order is open | [0xc314a48e…](https://explorer-studio.genlayer.com/tx/0xc314a48ed6ebd5b807e9ed9b43d87b88a7f4f099afe17f080a086c14f997cba6) | closed, the stake stays behind the open order |
| withdraw_stake while that order is open | [0xea3350a1…](https://explorer-studio.genlayer.com/tx/0xea3350a1478d8d75155ef19c8e8c5deb3f406b3539d2c6809dfe71b1d2e38072) | refused: the stake still backs 1 open order |
| judge the 12,283-character section | [0x207c3d9c…](https://explorer-studio.genlayer.com/tx/0x207c3d9c476cb123e150c07cac8ef7b678588b665855994a6f3adc62c2ef0962) | `breaks` by rule, no model asked; price, bond and one slice to the buyer |
| withdraw_stake once the order has ended | [0x3116aec6…](https://explorer-studio.genlayer.com/tx/0x3116aec6022b8bd6508bf17bacbb8a7f6e1067d302889fdd6e56d47c3f44acf9) | what was left of the stake went back to the seller |
| judge recipe 3 against "30 minutes or less" | [0x8bdc41d8…](https://explorer-studio.genlayer.com/tx/0x8bdc41d89f8a61dfdb5a3ad17eb31e93d89941a64ee6056c50a8c54a09226865) | `keeps`, 3 agree; the seller got 1.2 GEN; **the stake untouched** |
| close pack 2 with nothing open | [0xdf4a1628…](https://explorer-studio.genlayer.com/tx/0xdf4a1628d1734f310c5cc64fa042ce566a3fbd4470d8aac7cb6c6814c2f5279e) | the whole stake came back in the same call |
| a third order on pack 3 while two are open | [0xc400e2e8…](https://explorer-studio.genlayer.com/tx/0xc400e2e88e196e5b370f9a9ca07f74af08248327a80ca03ce449009331a7e9b4) | refused: "this listing's stake backs 2 open orders at a time and all 2 are taken"; the price came back |
| release pack 3's order after its 5-minute window | [0x6aab47ab…](https://explorer-studio.genlayer.com/tx/0x6aab47ab6fad48095c8cf3ca3ea8da7e9d37e3745eb02f94693f412f994364e4) | the seller got 0.5 GEN; the stake untouched |
| close pack 3 with an order still open | [0x67d75781…](https://explorer-studio.genlayer.com/tx/0x67d75781283bdfab17ab93d25fdc180e9bf9a919db6fc8eeaad77c043891484a) | closed by the seller, 0.5 GEN still held behind 1 open order |

At the end the seller's public record, read with `seller()`, counted exactly what the run did
(listed 4, sold 5, released 1, kept 1, broken 2, unclear 0), `staked` (0.5 GEN) and `stake_paid`
(0.75 GEN) were the sums over that seller's listings, `stats()` agreed over every listing, and an
address that never listed answered `known: false` with zeros. Everything version 1 proved (the
hash checks, both framings, withdraw_dispute, the missing → reveal walk and its cap, release
before and after the deadline, listings and ledger paging) ran again on this register and passed.

After the run, eight demo packs were listed from one demo seller key with a stake of twenty
slices each (ten times the price), so twenty buyers at a time can try each one: L5 to L12, the
shop's demo packs, beginning with the vegetarian recipe pack whose recipe 5 breaks a promise.

## Evidence for version 1

These calls ran on the accepted version 1 register, before stakes existed, so no payout below
carries a slice. Signed on 23 and 24 September 2026 on GenLayer Studio (chain 61999) by two
accounts, **A** the seller and **B** the buyer; each transaction below names them on the explorer. The calls marked
"anyone" or "a third key" were sent from a throwaway key, because the contract lets anyone make
them; that is the point of those rows. Register
[`0x197478dA434994220368cE3e32179B9409f1509D`](https://explorer-studio.genlayer.com/address/0x197478dA434994220368cE3e32179B9409f1509D).
`gen_getContractCode` on it returns the bytes of `contracts/as_described.py` at commit `11aeb18`
(sha256 `eda078db37dcd15ed5efed0e62c35e48d355b12539ec8c2558b74fa0223fe803`), and `genvm-lint` passes
on the code read back from the chain.

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
- A listing takes at most `stake ÷ slice` open orders at a time. When every slice is taken, a
  buy is refused, with the price returned, until an order ends; a seller who wants more buyers at
  once stakes more.
- A broken promise costs the seller one slice per verdict, not the whole stake: the buyer gets at
  most the price, the bond and one slice. `unclear`, `keeps`, `settle_stale` and `release` never
  touch the stake, so it pays only for a broken promise proven on chain or a section the seller
  could not produce.
- A stake left on a closed listing stays in the contract until the seller takes it back: in
  `close_listing`'s own call when no order is open, otherwise with `withdraw_stake` once the last
  order has ended. Nothing returns it on its own, nobody but the seller can take it back, and
  there is no partial withdrawal.
- The seller record is per address. A seller can start again from a new address, and that
  address starts with an empty record and a recent `first_listed`, which is what the page shows.
- The card, the badge and the JSON show only the site's own register, and an answer may be up to
  a minute old (ten minutes, marked stale, while Studio is busy).
- Studio is a test network. Transfers land a few seconds after finalization, and the site says
  so instead of showing a balance that has not moved yet.

## Licence

MIT; see `LICENSE`.
