# As Described: one page

**Purpose.** Sell a small text pack under promises the seller wrote, and enforce every
promise with money: a buyer who finds a section that breaks a promise is paid back, with the
bond, by the verdict of independent validators; a buyer who was wrong pays the seller the
bond. Nobody can refuse a refund, and nobody can fake the evidence, because the seller
committed the sha256 of every section on chain before the sale and the disputed section
must hash to that commitment before it is judged.

**The seller's stake (version 2).** A listing is backed by a stake the seller sends with
`list_pack`, counted in slices of half the price. Each open order (paid, disputed or missing)
holds one slice, so a listing takes `stake // slice` open orders at a time; a `breaks` verdict
and a reported section the seller never revealed each pay one slice to that buyer, in the same
transfer as the refund; a listing left with less than one slice closes itself. Every seller has
a public record on chain: what they listed, sold, kept and broke, and what their stakes hold
and have paid.

**Consensus.** `judge` runs one nondeterministic block. The leader asks the model twice about
the same promise and the same section, in two framings (*does this section BREAK the
promise?* and *does this section KEEP the promise?*), each answered from the closed set
`yes | no | unclear`. Code combines them: yes/no → `breaks`, no/yes → `keeps`, anything
else → `unclear` (a value, never a tolerance). Each validator asks the same two questions of
its own model, wrapped in try/except, and compares only the verdict word with the leader's
by exact string equality. The two framing answers are returned in the receipt and never
stored, and they are clamped before they get there: an answer outside the closed set, or a
pair that does not combine to the verdict the block returned, is replaced by an empty string.
That is a shape check on the leader's own output and no part of agreement, which stays the one
word. A leader whose round raised is never agreed with, so the round is retried rather than
settled: every rule of this contract is checked in the write method before any model is asked
and raises `[EXPECTED]` there, so the only error that can come out of a round is `[LLM_ERROR]`,
the judge misbehaving, and no validator can honestly say it saw the same one. The verdict
settles the money in the same call and is final.

**State.** `TreeMap[str, Listing]` of scalars: seller, title, kind, the promises and the
section hashes as JSON strings, price (atto), window (seconds), created_at, open, the
tallies orders / kept / broken / unclear, and (version 2, appended at the end) stake (what is
left), slice (half the price, fixed at listing time), open_orders, stake_paid and
closed_reason (`""`, `seller` or `out_of_stake`). Invariant: `stake >= open_orders * slice`. `TreeMap[str, Order]` of scalars: listing, buyer,
seller, price, opened_at, deadline_at (ISO) and deadline_seconds (the integer that is
compared), status, the disputed section and promise (0-based), bond, disputed_at, verdict,
judged_at, judgments, revealed_text, revealed_mask (bit *i* set once section *i* is on
chain), missing_reports (how many sections this buyer reported missing, capped at 3),
missing_index, missing_at, paid_buyer, paid_seller, settled_by, verdict_line,
the one sentence the contract writes from closed tokens when an order reaches a final
status, and paid_from_stake (the part of paid_buyer that came out of the seller's stake).
`TreeMap[str, SellerRecord]` of scalars, keyed by lowercase hex: listed, sold, released, kept,
broken, unclear, refunded, stale, staked (held now across every listing), stake_paid and
first_listed. Ids are contract-assigned and sequential (`L1, L2, …`, `O1, O2, …`). Four indexes:
order ids per listing, order ids per buyer (lowercase hex), `reveals` (`"O3:0"` → the
exact text of a revealed section, kept for good) and `judged_digests`
(sha256(order|section|promise|text) → judged once), plus listing ids per seller. Six
top-level counters feed `stats()`, and three more for the stake: seller_count,
stake_held_total and stake_paid_total.

Status machine:

```
paid ──(buyer: open_dispute + bond)──> disputed ──(anyone: judge)──> settled        breaks | keeps | unclear
disputed ──(buyer: withdraw_dispute)──> paid                                          bond → buyer, deadline unchanged
paid ──(anyone, after the deadline: release)──> released                              price → seller
paid ──(buyer: report_missing)──> missing ──(seller, within 24 h: reveal)──> paid     deadline ≥ now + 24 h
                                  missing ──(anyone, after 24 h: refund_missing)──> refunded   price + one slice → buyer, no model
disputed ──(anyone, after 24 h with no verdict: settle_stale)──> settled_stale       price → seller, bond → buyer
```

`disputed` is not a one-way door. `judge` refuses any text that does not hash to the
seller's commitment, so a buyer who disputed a section the seller never delivered as
committed could otherwise neither judge it nor report it missing, and `settle_stale` would
hand that seller the price 24 hours later. `withdraw_dispute` returns the bond and puts the
order back to `paid`, where `report_missing` → `refund_missing` is the remedy. It grants no
new power: the deadline is untouched and the price stays in escrow.

Money at `settled`: `breaks` → price + bond + one slice of the seller's stake to the buyer;
`keeps` → price + bond to the seller; `unclear` → price to the seller, bond back to the buyer.
`keeps`, `unclear`, `release` and `settle_stale` never touch the stake. Every final status
frees the order's slice: `open_orders` goes down by one in `_pay`, the single exit for money.

**Methods.** All arguments are strings; all returns are JSON strings.

| write | who | payable | notes |
|---|---|---|---|
| `list_pack(title, kind, promises_json, hashes_json, price_atto, window_seconds)` | anyone, becomes the seller | yes: the stake, at least one slice | every field validated; refusals **refund and return `{"ok":false,"reason","returned"}`**; returns `{"ok":true,"listing":"L3",…,"stake","slice","capacity"}` |
| `close_listing(listing_id)` | the seller | no | no new orders; existing orders continue, each still backed by its slice; with no order open the whole stake comes back in the same call (`returned`) |
| `withdraw_stake(listing_id)` | the seller | no | the listing is closed and no order is open: what is left of the stake goes back to the seller |
| `buy(listing_id)` | anyone but the seller, becomes the buyer | yes | value must equal the price exactly; refused while every slice backs an open order; refusals **refund and return `{"ok":false,"reason","returned"}`** |
| `open_dispute(order_id, section_index, promise_index)` | the buyer, before the deadline | yes | 0-based indices as digit strings; value must equal the bond exactly (`bond_for`); refusals refund |
| `withdraw_dispute(order_id)` | the buyer, while the order is disputed | no | bond back to the buyer, status → paid, deadline unchanged; the price stays in escrow |
| `judge(order_id, section_text)` | anyone (open on purpose) | no | text must hash to `hashes[section_index]`; digest dedupe; one consensus block; settles at once |
| `release(order_id)` | anyone (open on purpose) | no | status paid and now ≥ deadline → price to the seller |
| `report_missing(order_id, section_index)` | the buyer, before the deadline | no | → missing; the seller has 24 h; once per section and at most 3 sections per order |
| `reveal(order_id, section_text)` | the seller, within 24 h | no | text must hash to `hashes[missing_index]`; → paid; deadline = max(deadline, now + 24 h) |
| `refund_missing(order_id)` | anyone (open on purpose) | no | status missing and 24 h passed → price + one slice of the stake to the buyer, no model |
| `settle_stale(order_id)` | anyone (open on purpose) | no | status disputed, no verdict, 24 h passed → price to the seller, bond to the buyer |

Views: `listing(id)`, `listing_ids()`, `listings(offset, limit)` (a page of listing rows,
oldest first, limit clamped to 1–25, so one call reads a shelf instead of one read per pack),
`order(id)` (adds `bond_required`, `window_open`, `now`, `revealed`, which lists every section
on chain as `{index, text}`, and `verdict_line`), `orders_of(listing)`, `orders_of_buyer(hex)`,
`ledger(count)` (last N, newest first, ≤ 50), `stats()` (listings, orders, kept, broken,
unclear, refunded, released, stale, stake_held, stake_paid, sellers), `seller(hex)` (one
seller's record and listing ids; an unknown address answers `known: false` and zeros),
`bond_for(listing)`, `rules()`. A listing row carries stake, slice, open_orders, capacity,
free (capacity minus open orders, never below 0), stake_paid and closed_reason; order and
ledger rows carry paid_from_stake.

Constants: title 3–60 chars; kinds `recipes | templates | notes | prompts | guide | other`;
1–6 promises of 8–160 chars, each one line; 1–20 sections (never above 32: `revealed_mask` is
a `u32` and carries one bit per section), each hash 64 lowercase hex of the exact utf-8 bytes;
a section ≤ 4000 chars when revealed; at most 3 missing reports per order; price 0.1–1000 GEN;
window 5 min – 30 days; bond 20 % of the price (floor 0.01 GEN); one slice of the stake 50 % of
the price; reveal and stale windows 24 h.

**Reuse.** Any sale of committed text under stated promises: a document pack, a dataset
described by rules, a course whose modules make claims. Swap the two questions for another
pair of opposite framings and the same block, boundary, hash binding, bond and windows
carry over. `order`, `ledger` and `stats` let another contract or a site read the outcome
with no model.

**Limits.** The contract judges one section against one promise per dispute; a promise
that needs the whole pack ("no two recipes repeat") is judged section by section and may
come back `unclear`. Sections are bound by hash, not by content: a seller can commit a hash
of a section they never deliver, which is what `report_missing` → `refund_missing` is for.
A section over 4000 characters cannot be revealed, so on chain such a section is in effect
missing and ends in `refund_missing`; in a dispute it is not refused but settled `breaks`
by rule, with no model asked, because the cap is published and the seller committed past
it. The site allows 12 sections of up to 4000 characters, the contract 20. The clock is the
transaction's own datetime; every time-gated write refuses when it cannot be read rather
than guessing. Which model the validators run is not a fact the contract knows: a verdict
is what independent runs agreed on, not a truth about the section.

A section can be reported missing only once, because a revealed section is on chain for
good, so one section can move the deadline out by at most 24 hours. Two bounds, not one: the
mask stops the same section coming round again, and a counter on the order stops the walk
across the pack at three sections. Without the counter a buyer of a twenty-section pack could
make the seller either publish all of it on chain or lose the price, holding the escrow for up
to 20 × 24 hours. Three is what an honest buyer needs and no more: a pack that never arrived
takes one report, the seller cannot reveal what they never had, and `refund_missing` returns
the whole price, which anybody may call. The cap is preferred to the other candidate, a bond on
`report_missing`, because a bond would put a second signature and a second payment in front of
every buyer whose pack did not arrive, while the cap costs an honest buyer nothing.
