# Decisions

## The boundary, written before the code

- **The contract owns:** the ids, the price, the window, the deadline (computed from the
  transaction's own clock), the bond, the status, the verdict (the closed set, both
  framings, the comparison rule), the sentence stored with the verdict, the digest register,
  the counters, and every transfer.
- **The seller owns:** the title, the kind, the promises and the section hashes, all
  validated at listing time; and, later, the text of a section they reveal. The promise
  is untrusted the moment it is written: fenced at the prompt boundary, declared untrusted
  in the prompt, stored as written.
- **The buyer owns:** the choice of which section and which promise to dispute, and the
  section text they reveal to `judge`. That text is untrusted too, and it is also
  **bound**: it must hash to what the seller committed before the sale, or the call
  refuses before any model is asked.
- **Nothing outside the chain is fetched.** The evidence is the seller's promise and the
  seller's own section, proven by hash. No page, no file, no image.

User action, evidence, nondet call, equivalence, state, settlement:
`open_dispute` (bond), `judge` (the section, hash-checked), each validator asks the
same two questions of its own model, one word from `breaks | keeps | unclear`, compared
as one word, and the money moves in the same call.

## Why both framings inside one block

A yes/no question has a position bias of its own: models lean towards agreeing with the
question as asked. Every validator builds the prompt the same way, so on its own consensus
cannot see that lean. Asking *does it BREAK the promise?* and *does it KEEP the promise?*
in the same block, and requiring the two answers to point the same way, is the only place
the lean is caught, and the disagreement lands in the stored value as `unclear`, never in
a comparison that forgives it. Sequential prompts in one block are legal; nested blocks are
not; the static test pins both calls inside `leader_fn` and counts exactly two.

## Why three words

Difficulty of the judgment and difficulty of the agreement are independent, and the second
is chosen by the block's return value. Whether one section contradicts one promise is a
hard reading; agreeing on one of `breaks | keeps | unclear` is not. Nothing finer was asked
for, no confidence and no explanation, because nothing finer would settle. The contract
writes the sentence the site shows; no model prose reaches storage.

## Why the verdict settles at once, and there is no appeal

An appeal round is worth its cost only when a second look can see something new. Here
nobody can write anything new: the promise is fixed at listing, the section is fixed by
hash, and a second look would read the same bytes. What an appeal would protect against is
already carried by two rules: **the buyer posts a bond** (20 % of the price) that goes to
the seller on `keeps`, so disputing costs something when it changes nothing; and
**`unclear` pays the seller**, so the burden of proof is on the party who chose to dispute,
because a section that does not clearly contradict the promise is not a broken promise. Both
rules are published by `rules()`. A round with no majority stores nothing and may be asked
again (`judge` is open for exactly this); a stored verdict is final and the same
(order, section, promise, text) digest is never judged twice.

## Why judging is per order, not per text

The dedupe digest is `sha256(order | section | promise | text)`, so identical bytes bought
twice are judged twice and can come back with different verdicts. Keying the register on
content instead, which would settle every later order from the first stored verdict, was
considered and rejected: it would let whoever disputes first, including a seller's second
wallet buying their own pack, fix the verdict for every buyer who came after. The cost of
the per-order key is one extra round per order; the cost of the content key is a verdict
market. Two runs on the same text disagreeing is a fact about the question, and the site
says so rather than hiding it behind a cache.

## Why judge, release, refund_missing and settle_stale are open

Each is a write whose outcome the caller cannot steer. `judge`: the text is bound by hash,
so any caller supplies the same bytes or is refused. The other three: the outcome is fixed
by rule and by the clock. Leaving them open means the money can never be locked by one side
going quiet: a seller who disappears still gets paid after the window, a buyer whose
seller never reveals still gets refunded, and a dispute nobody judged still ends. The
reasons are written into the static authority test, so a write added later that is neither
gated nor listed fails the suite.

## Why `disputed` is not a one-way door

`judge` refuses any text that does not hash to the seller's commitment. A buyer who disputes
a section the seller never delivered as committed could therefore neither judge it nor, while
the order was disputed, report it missing, and `settle_stale` would have handed that seller
the price 24 hours later. `withdraw_dispute` is the way out: the buyer gets the bond back and
the order returns to `paid`, where `report_missing` and then `refund_missing` are the remedy.
It grants no new power, because the deadline is untouched and the price stays in escrow, and
it is buyer-only, so a seller can never use it to clear a dispute they are losing.

## Why three missing reports, not one and not unlimited

A section already on chain can never be reported missing again, which bounds each section to
one 24-hour extension. That alone does not bound the walk **across** a pack: a buyer of a
twenty-section pack could report them one at a time and make the seller choose, section by
section, between publishing the whole pack on chain and losing the price, holding the escrow
for up to 20 × 24 hours. A counter on the order stops that at three. The alternative was a
bond on `report_missing`, which was rejected because it would put a second signature and a
second payment in front of every buyer whose pack simply did not arrive. Three costs an
honest buyer nothing: a pack that never arrived takes one report, the seller cannot reveal
what they never had, and `refund_missing` returns the whole price.

## Why an oversize section is decided by rule

The cap on a revealed section (4000 characters) is published by `rules()` and enforced at
`reveal`. A seller can still commit the hash of a longer section, because `list_pack` takes
hashes and never the text. If such a section is disputed, `judge` checks the hash first and,
when the text matches but is past the cap, settles `breaks` by rule with no model asked: the
cap was published before the sale and the seller committed past it. The receipt says
`by_rule: true` with both framing answers empty, so nobody can read a validator opinion into
a verdict no validator was asked for.

## Why unagreed prose never reaches storage

The block returns three tokens: the verdict and the two framing answers. Validators compare
the verdict only. The framing answers are returned in the receipt for the site to show and
are never written to a row, and before they reach the receipt they are clamped: an answer
outside the closed set, or a pair that does not combine to the verdict the block returned, is
replaced by an empty string. That is a shape check on one node's output, not a tightening of
agreement between honest nodes. A leader-written reason would be one node's words kept under
everybody's authority, and a free-text channel for a hostile leader; the contract writes the
sentence instead, from the closed set and the numbers it already holds, and stores it as
`verdict_line` in the same call that moves the money.

## Why a leader error is never agreed with

Every rule of this contract is checked in the write method, before any model is asked, and
raises `[EXPECTED]` there. So the only error a round itself can raise is `[LLM_ERROR]`, the
judge misbehaving, and no validator can honestly say it saw the same one. `validator_fn`
therefore returns `False` for any leader error: the round is retried rather than settled. An
earlier design classified leader errors into expected and transient; both branches turned out
to be unreachable for the reason above, and they were deleted rather than left as code that
reads like a policy nobody can trigger.

## Why a hash, not a label

A section id is a name; a hash is the bytes. The buyer reveals text, not an index alone,
and the contract recomputes sha256 over the exact utf-8 bytes before the block runs. A
seller cannot later deny a section, and a buyer cannot judge text the seller never sold.
The digest register keys on the content too (order, section, promise, text), not on an id.

## Why the clock refuses instead of guessing

The only clock every node sees identically is `gl.message_raw["datetime"]`; there is no
block timestamp, and floats and `datetime` trap the VM in deterministic mode, so the
calendar is integer arithmetic both ways (`_instant_seconds`, `_iso_from_seconds`). When
the clock cannot be read, a write that depends on it (`buy`, `open_dispute`, `release`,
`report_missing`, `reveal`, `refund_missing`, `settle_stale`) refuses, refunding if it
took value, rather than opening or closing a window by accident. Views treat an unreadable
clock as "window open" so that nothing ever looks closed that is not.

## Why payable refusals refund

Value sent to a refused payable call is stranded by the chain. `buy` and `open_dispute`
therefore never raise after taking value: every refusal returns the money in the same
transaction and says why in the result. The refusal is a signed transaction and its reason is
in its receipt on the explorer; it is not a ledger row, because `ledger()` lists orders.

## Verified and not verified

- **Verified offline** (`pytest tests/ -q`, 84 tests, no network): every validation, every
  refund, the authority table, the fence and the delimiter closure, the combine table, the
  consensus closures with a stubbed model, the sentence the contract writes, all money paths
  with a recording payee, the calendar both ways against Python's, the journeys; and
  `tools/mutate.py`, 83 defences removed or inverted one at a time, none surviving.
- **Verified on Studio** (`tests/on_chain/smoke.mjs` and `tests/site/e2e.mjs`, throwaway
  accounts and a throwaway register; see `tests/on_chain.md`). Each of these is a signed
  transaction:
  - `breaks`: [`0x8020a4f4…`](https://explorer-studio.genlayer.com/tx/0x8020a4f4ed4a0f65aeda4fe8a9036de42feb685089cc59174f40aeecbfa7aae8),
    3 agree, 1 disagree, 1 idle; price and bond to the buyer.
  - `keeps`: [`0x86b1a79c…`](https://explorer-studio.genlayer.com/tx/0x86b1a79c71875e3bc15212e368344030c4750cc83d0938cfc97577971ad9e1f5),
    3 agree, 0 disagree, 2 idle; price and bond to the seller.
  - `breaks` by rule on an oversize section:
    [`0x8fb2660b…`](https://explorer-studio.genlayer.com/tx/0x8fb2660bd604dbf63ea6995f02bcbdafddf2aa652310ec0e7f3ee6905d9c4142),
    12,283 bytes of argument, `by_rule: true`, both framing answers empty.
  - a verdict is final:
    [`0x6ff77aa9…`](https://explorer-studio.genlayer.com/tx/0x6ff77aa99fa96800d9ca78bc6610352fe5dc1ffc8cba594ed2b66d0d8b1dba3c);
    text that does not hash to the commitment is refused before any model runs:
    [`0xa4b60fb3…`](https://explorer-studio.genlayer.com/tx/0xa4b60fb3b1ff549b634d40afe9752487c29d020b2b96440150fa815efcb69acc).
  - `withdraw_dispute`:
    [`0xa594480a…`](https://explorer-studio.genlayer.com/tx/0xa594480ad1b1dfdd7f44ff98e8d9db7e71ec95d11e3cbb78b47d3337fcdfe789)
    (bond back, deadline unchanged), refused for a stranger
    [`0x4e2c709a…`](https://explorer-studio.genlayer.com/tx/0x4e2c709ad5b7ec063083a78ad6161a78138578f47ddaa0697bc57ffed124e309)
    and for a paid order
    [`0x3eff9075…`](https://explorer-studio.genlayer.com/tx/0x3eff9075f9bbe916b5c424dac7926476108c4a2689fe8dcedfe6272ea594a416).
  - `release` refused while the window is open
    [`0xd2487d49…`](https://explorer-studio.genlayer.com/tx/0xd2487d4986d8840cf29b8ce103565a103877acaaa24d3535ee30dcb9a6bfea99)
    and paying the seller after it
    [`0xb47bf9a3…`](https://explorer-studio.genlayer.com/tx/0xb47bf9a36c3a7c4977228ae69f8f90b4a52012346f5128ef868f2a3a1e33a211).
  - missing and reveal: the report
    [`0x5f838c5d…`](https://explorer-studio.genlayer.com/tx/0x5f838c5d0ba53fad0fe7d19baf08429608e7a97cde3bc2273b0220a57a2a638f),
    a reveal with the wrong bytes refused
    [`0xc7899086…`](https://explorer-studio.genlayer.com/tx/0xc78990865d33644b370cf308f940f144fa900cdd39970291da7cf84fe2b40a18),
    the reveal
    [`0xfc2b9d61…`](https://explorer-studio.genlayer.com/tx/0xfc2b9d619e94fefb69b1d70942b54d02d6946bee93e1e6b137d6d4ccbee938b1),
    a section already on chain refused a second report
    [`0xd9e361b7…`](https://explorer-studio.genlayer.com/tx/0xd9e361b750424f29dff82ec24f8330ffbbe50e6bb33e9afe31dc20f8237f134f),
    and a fourth report refused by the cap
    [`0x973a25bf…`](https://explorer-studio.genlayer.com/tx/0x973a25bf2644368d9f57b4e40b9b0cd720f28980717652f725f7265aa4493b45).
  - payable refusals really refund: a wrong-value `buy`
    [`0x77cfc25e…`](https://explorer-studio.genlayer.com/tx/0x77cfc25e54184a5e2fea04965183cb9a56be1fd4f4d890589a58765cda622b3d)
    and a stranger's `open_dispute`
    [`0xd8a4c414…`](https://explorer-studio.genlayer.com/tx/0xd8a4c4146ce2de84199bb59b447358dd6d694296cdc748376f81c92c5593db8d),
    both `{"ok": false}` with the value back in the sender's balance.
  - `stats`, `ledger`, `listings` and `rules` read with no model.
- **Not verified, by design:** which model the validators run, and how they would read a
  promise that needs world knowledge ("healthy", "authentic"). The site warns sellers
  about such promises; the contract does not try to detect them.
- **Not exercised on chain** so far, covered offline only: `refund_missing` and
  `settle_stale`, which both need 24 hours to pass; `close_listing`; and the `unclear`
  verdict, which no run has produced yet (`stats()` reports `unclear: 0` on every register
  measured). The owner's signing run is where the first three are meant to land, and
  `unclear` is what the model returns or does not; it will be reported as measured.
