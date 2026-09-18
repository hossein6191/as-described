# Handoff from the contract builder

Facts about `contracts/as_described.py` that the site codes against. Nothing here asks
for a change in another builder's file; it records the choices the spec left open, so
`lib/chain.ts`, the mock and the pages agree with the deployed contract.

## Indices count from 0

`open_dispute(order_id, section_index, promise_index)` and `report_missing(order_id,
section_index)` take **0-based** indices as digit strings: recipe 5 is `"4"`, promise P1
is `"0"`. The `order` view and `ledger` rows return the same 0-based `section_index` /
`promise_index`. The site adds 1 for display ("section 5", "P1"). The contract's own
`[EXPECTED]` messages already say the 1-based number ("…committed for section 5").

## Result keys

- `list_pack` → `{"ok":true,"listing":"L3","sections":n,"promises":m,"price":"…","window_seconds":n}`
- `buy` → `{"ok":true,"order":"O7","listing":"L3","price":"…","deadline_at":"2026-…Z","status":"paid"}`;
  refusal → `{"ok":false,"reason":"…; your funds were returned"}` (value refunded in the same tx)
- `open_dispute` → `{"ok":true,"order","status":"disputed","section_index":4,"promise_index":0,"bond":"…"}`; refusal as above
- `judge` → `{"ok":true,"order","verdict":"breaks|keeps|unclear","break_answer":"yes|no|unclear","keep_answer":…,"section_index","promise_index","to_buyer":"…","to_seller":"…","status":"settled"}`
- `release` → `{"ok":true,"order","status":"released","to_seller":"…"}`
- `report_missing` → `{"ok":true,"order","status":"missing","missing_index":n,"reveal_hours":24}`
- `reveal` → `{"ok":true,"order","status":"paid","section_index":n,"deadline_at":"…"}`
- `refund_missing` → `{"ok":true,"order","status":"refunded","to_buyer":"…"}`
- `settle_stale` → `{"ok":true,"order","status":"settled_stale","to_buyer":"…","to_seller":"…"}`
- Every non-payable refusal raises; the receipt's `execution_result` is `ERROR` and the
  message starts with `[EXPECTED] ` followed by one plain sentence.

## Views

- `listing(id)` adds `promises` (list), `hashes` (list), `section_count`, `bond` (string, atto)
  to the row; unknown id → `{"error":"no listing named …"}`.
- `order(id)` adds `bond_required` (string; `"0"` unless status is `paid`), `window_open`
  (bool) and `now` (ISO). `deadline_seconds` is an integer.
- `orders_of`, `orders_of_buyer`, `listing_ids` return a JSON **list** of ids (`"[]"` when
  none). `orders_of_buyer` lowercases its argument.
- `bond_for(listing)` returns a **bare digit string** (atto), not an object; unknown listing → `{"error":…}`.
- `ledger(count_str)` → up to 50 rows, newest first; a non-numeric or `0` count means 10.
- `stats()` → `{listings, orders, kept, broken, unclear, refunded, released, stale}` — `stale`
  is one field more than DESIGN listed.
- Statuses: `paid | disputed | settled | released | missing | refunded | settled_stale`.
- Money amounts are always decimal strings in atto; `deadline_at`, `opened_at`,
  `disputed_at`, `judged_at`, `missing_at`, `created_at` are ISO-8601 UTC strings ending in `Z`.

## Amounts the site must send exactly

`buy` requires `value == price` exactly; `open_dispute` requires `value == bond_for(listing)`
exactly (20 % of the price, floor 0.01 GEN). Any other value is refunded with `ok:false`.

## Storage names (only matters for anyone reading raw state)

The DESIGN storage field `listing_ids` collided with the view `listing_ids()`, so the
DynArrays are `listing_id_list` and `order_id_list`. The view names are unchanged.
