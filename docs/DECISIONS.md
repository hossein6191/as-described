# Decisions

## The boundary, written before the code

- **The contract owns:** the ids, the price, the window, the deadline (computed from the
  transaction's own clock), the bond, the status, the verdict (the closed set, both
  framings, the comparison rule), the digest register, the counters, and every transfer.
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

User action → evidence → nondet call → equivalence → state → settlement:
`open_dispute` (bond) → `judge` (the section, hash-checked) → each validator asks the
same two questions of its own model → one word from `breaks | keeps | unclear` → compared
as one word → the money moves in the same call.

## Why both framings inside one block

A yes/no question has a position bias of its own: models lean towards agreeing with the
question as asked. Every validator builds the prompt the same way, so on its own consensus
cannot see that lean. Asking *does it BREAK the promise?* and *does it KEEP the promise?*
in the same block, and requiring the two answers to point the same way, is the only place
the lean is caught — and the disagreement lands in the stored value as `unclear`, never in
a comparison that forgives it. Sequential prompts in one block are legal; nested blocks are
not; the static test pins both calls inside `leader_fn` and counts exactly two.

## Why three words

Difficulty of the judgment and difficulty of the agreement are independent, and the second
is chosen by the block's return value. Whether one section contradicts one promise is a
hard reading; agreeing on one of `breaks | keeps | unclear` is not. Nothing finer was asked
for — no confidence, no explanation — because nothing finer would settle. The contract
writes the sentence the site shows; no model prose reaches storage.

## Why the verdict settles at once, and there is no appeal

Split had an appeal with a bond because either side could write a new account. Here
nobody can write anything new: the promise is fixed at listing, the section is fixed by
hash, and a second look would read the same bytes. What an appeal would protect against is
already carried by two rules: **the buyer posts a bond** (20 % of the price) that goes to
the seller on `keeps`, so disputing costs something when it changes nothing; and
**`unclear` pays the seller**, so the burden of proof is on the party who chose to dispute
— a section that does not clearly contradict the promise is not a broken promise. Both
rules are published by `rules()`. A round with no majority stores nothing and may be asked
again (`judge` is open for exactly this); a stored verdict is final and the same
(order, section, promise, text) digest is never judged twice.

## Why judge, release, refund_missing and settle_stale are open

Each is a write whose outcome the caller cannot steer. `judge`: the text is bound by hash,
so any caller supplies the same bytes or is refused. The other three: the outcome is fixed
by rule and by the clock. Leaving them open means the money can never be locked by one side
going quiet — a seller who disappears still gets paid after the window, a buyer whose
seller never reveals still gets refunded, and a dispute nobody judged still ends. The
reasons are written into the static authority test, so a write added later that is neither
gated nor listed fails the suite.

## Why unagreed prose never reaches storage

The block returns three tokens: the verdict and the two framing answers. Validators compare
the verdict only; the framing answers are returned in the receipt for the site to show and
are never written to a row. A leader-written reason would be one node's words kept under
everybody's authority, and a free-text channel for a hostile leader; the contract writes
the sentence instead, from the closed set and the numbers it already holds.

## Why a hash, not a label

A section id is a name; a hash is the bytes. The buyer reveals text, not an index alone,
and the contract recomputes sha256 over the exact utf-8 bytes before the block runs. A
seller cannot later deny a section, and a buyer cannot judge text the seller never sold.
The digest register keys on the content too (order, section, promise, text), not on an id.

## Why the clock refuses instead of guessing

The only clock every node sees identically is `gl.message_raw["datetime"]`; there is no
block timestamp, and floats and `datetime` trap the VM in deterministic mode, so the
calendar is integer arithmetic both ways (`_instant_seconds`, `_iso_from_seconds`). When
the clock cannot be read, a write that depends on it — `buy`, `open_dispute`, `release`,
`report_missing`, `reveal`, `refund_missing`, `settle_stale` — refuses (refunding if it
took value) rather than opening or closing a window by accident. Views treat an unreadable
clock as "window open" so that nothing ever looks closed that is not.

## Why payable refusals refund

Value sent to a refused payable call is stranded by the chain. `buy` and `open_dispute`
therefore never raise after taking value: every refusal returns the money in the same
transaction and says why in the result, and the refusal is stored on the explorer as a
`{"ok": false}` record.

## Verified and not verified

- Verified offline (`pytest tests/ -q`, 44 tests, no network): every validation, every
  refund, the authority table, the fence and the delimiter closure, the combine table, all
  money paths with a recording payee, the calendar both ways against Python's, the
  journeys; and `tools/mutate.py`, 50 defences removed one at a time, none surviving.
- Verified on Studio (`tests/on_chain/smoke.mjs`, throwaway accounts; see
  `tests/on_chain.md`): the refusals as signed transactions, `emit_transfer` landing after
  finalisation and read from balances, the two verdicts, release after a 300-second
  window, and the missing → reveal → paid journey.
- Not verified, by design: which model the validators run, and how they would read a
  promise that needs world knowledge ("healthy", "authentic"). The site warns sellers
  about such promises; the contract does not try to detect them.
- Not exercised on chain in the smoke: `refund_missing` and `settle_stale` need 24 hours
  to pass; they are covered offline only.
