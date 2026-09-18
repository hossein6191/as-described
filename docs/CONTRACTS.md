# As Described — one page

**Purpose.** Sell a small text pack under promises the seller wrote, and enforce every
promise with money: a buyer who finds a section that breaks a promise is paid back, with the
bond, by the verdict of independent validators; a buyer who was wrong pays the seller the
bond. Nobody can refuse a refund, and nobody can fake the evidence, because the seller
committed the sha256 of every section on chain before the sale and the disputed section
must hash to that commitment before it is judged.

**Consensus.** `judge` runs one nondeterministic block. The leader asks the model twice about
the same promise and the same section, in two framings — *does this section BREAK the
promise?* and *does this section KEEP the promise?* — each answered from the closed set
`yes | no | unclear`. Code combines them: yes/no → `breaks`, no/yes → `keeps`, anything
else → `unclear` (a value, never a tolerance). Each validator asks the same two questions of
its own model, wrapped in try/except, and compares only the verdict word with the leader's
by exact string equality. The two framing answers are returned in the receipt and never
stored. Errors carry a class prefix: `[EXPECTED]` must match exactly, `[TRANSIENT]` agrees
with `[TRANSIENT]`, `[LLM_ERROR]` never agrees. The verdict settles the money in the same
call and is final.

**State.** `TreeMap[str, Listing]` of scalars: seller, title, kind, the promises and the
section hashes as JSON strings, price (atto), window (seconds), created_at, open, and the
tallies orders / kept / broken / unclear. `TreeMap[str, Order]` of scalars: listing, buyer,
seller, price, opened_at, deadline_at (ISO) and deadline_seconds (the integer that is
compared), status, the disputed section and promise (0-based), bond, disputed_at, verdict,
judged_at, judgments, revealed_text, missing_index, missing_at, paid_buyer, paid_seller,
settled_by. Ids are contract-assigned and sequential (`L1, L2, …`, `O1, O2, …`). Three
indexes: order ids per listing, order ids per buyer (lowercase hex), and
`judged_digests` — sha256(order|section|promise|text) → judged once. Six top-level
counters feed `stats()`.

Status machine:

```
paid ──(buyer: open_dispute + bond)──> disputed ──(anyone: judge)──> settled        breaks | keeps | unclear
paid ──(anyone, after the deadline: release)──> released                              price → seller
paid ──(buyer: report_missing)──> missing ──(seller, within 24 h: reveal)──> paid     deadline ≥ now + 24 h
                                  missing ──(anyone, after 24 h: refund_missing)──> refunded   price → buyer, no model
disputed ──(anyone, after 24 h with no verdict: settle_stale)──> settled_stale       price → seller, bond → buyer
```

Money at `settled`: `breaks` → price + bond to the buyer; `keeps` → price + bond to the
seller; `unclear` → price to the seller, bond back to the buyer.

**Methods.** All arguments are strings; all returns are JSON strings.

| write | who | payable | notes |
|---|---|---|---|
| `list_pack(title, kind, promises_json, hashes_json, price_atto, window_seconds)` | anyone, becomes the seller | no | every field validated; refusals raise `[EXPECTED]`; returns `{"ok":true,"listing":"L3",…}` |
| `close_listing(listing_id)` | the seller | no | no new orders; existing orders continue |
| `buy(listing_id)` | anyone but the seller, becomes the buyer | yes | value must equal the price exactly; refusals **refund and return `{"ok":false}`** |
| `open_dispute(order_id, section_index, promise_index)` | the buyer, before the deadline | yes | 0-based indices as digit strings; value must equal the bond exactly (`bond_for`); refusals refund |
| `judge(order_id, section_text)` | anyone (open on purpose) | no | text must hash to `hashes[section_index]`; digest dedupe; one consensus block; settles at once |
| `release(order_id)` | anyone (open on purpose) | no | status paid and now ≥ deadline → price to the seller |
| `report_missing(order_id, section_index)` | the buyer, before the deadline | no | → missing; the seller has 24 h |
| `reveal(order_id, section_text)` | the seller, within 24 h | no | text must hash to `hashes[missing_index]`; → paid; deadline = max(deadline, now + 24 h) |
| `refund_missing(order_id)` | anyone (open on purpose) | no | status missing and 24 h passed → price to the buyer, no model |
| `settle_stale(order_id)` | anyone (open on purpose) | no | status disputed, no verdict, 24 h passed → price to the seller, bond to the buyer |

Views: `listing(id)`, `listing_ids()`, `order(id)` (adds `bond_required`, `window_open`, `now`),
`orders_of(listing)`, `orders_of_buyer(hex)`, `ledger(count)` (last N, newest first, ≤ 50),
`stats()`, `bond_for(listing)`, `rules()`.

Constants: title 3–60 chars; kinds `recipes | templates | notes | prompts | guide | other`;
1–6 promises of 8–160 chars; 1–20 sections, each hash 64 lowercase hex of the exact utf-8
bytes; a section ≤ 4000 chars when revealed or judged; price 0.1–1000 GEN; window 5 min –
30 days; bond 20 % of the price (floor 0.01 GEN); reveal and stale windows 24 h.

**Reuse.** Any sale of committed text under stated promises: a document pack, a dataset
described by rules, a course whose modules make claims. Swap the two questions for another
pair of opposite framings and the same block, boundary, hash binding, bond and windows
carry over. `order`, `ledger` and `stats` let another contract or a site read the outcome
with no model.

**Limits.** The contract judges one section against one promise per dispute; a promise
that needs the whole pack ("no two recipes repeat") is judged section by section and may
come back `unclear`. Sections are bound by hash, not by content: a seller can commit a hash
of a section they never deliver, which is what `report_missing` → `refund_missing` is for.
A section over 4000 characters can be neither revealed nor judged; on chain such a section
is, in effect, missing (the site caps uploads at 1500). The clock is the transaction's own
datetime; every time-gated write refuses when it cannot be read rather than guessing. A
buyer can report sections missing one at a time to stall a seller for up to one reveal per
section; the money still moves at the end. Which model the validators run is not a fact
the contract knows: a verdict is what independent runs agreed on, not a truth about the
section.
