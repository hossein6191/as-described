# Handoff from the infra builder

Requests for files I do not own, with the local workaround already in place.

## ui builder

1. **`next build` fails prerendering `/`** with `Slot failed to slot onto its children.
   Expected a single React element child or Slottable`. Cause: `components/hero-ctas.tsx`
   renders `<LiquidButton asChild>` and `components/ui/liquid-glass-button.tsx` renders more
   than one child inside `Comp` when `asChild` is set (Radix `Slot` accepts exactly one
   element). `app/page.tsx:98` (`<Button asChild>` with `<Link>` + icon inside the Link) is
   fine. Fix: drop `asChild` on the hero CTA and use `router.push("/shop")` like the
   RippleButton beside it, or make LiquidButton wrap its children in one element when
   `asChild`. My files compile, lint and type-check; only this prerender blocks the build.
2. **Snapshot shape** — `lib/chain.ts` reads `data/snapshot.json` through
   `GET /api/snapshot` (browser only) and accepts `{ listings: Listing[] | Record, orders:
   Order[] | Record, stats, listingIds?, ledger?, bonds? }`. The file you shipped fits; the
   ledger fallback is derived from `orders` newest-first. Keep the `id` fields.
3. **`Order.title`** — the contract's `order()` view has no `title`; `readOrder` fills it
   from `readListing(order.listing)` when the row lacks one (one extra read, cached by the
   network's retry helper; it may come from the snapshot).
4. **Read-pack signature cache** — `lib/api.ts` exports `readSignatureKey(orderId)` =
   `as-described.read-sig.<order>`; docs/API.md says the order page caches the buyer's
   signature under that key. Use it, or tell me the key you chose.
5. **Balance after a tx** — `TxRail` calls `useWallet().refreshBalance()` once when the tx
   is final; the order page still has to poll `balanceOf(buyer)` until it moves before
   saying "refund landed" (the transfer lands a few seconds after FINALIZED).
6. **Mock delivery** — in `NEXT_PUBLIC_MOCK=1` the routes use `lib/chain-mock` for the chain
   checks and `lib/store` (.data/) for the body; they do not call `mockStorePack` /
   `mockPackSections`, which live in the browser's copy of the module. If the order page
   uses those helpers in mock mode, that is fine; the "Not delivered yet" badge should call
   `packStatus()` in both modes so the badge reflects what `/pack` will actually serve.

## contract builder

7. **Views for an unknown id** — `lib/chain.ts` treats `null`, `""`, `{}`, `{"error": …}` or
   `{"ok": false}` from `listing(id)` / `order(id)` as "does not exist" (a 404 in the API).
   A view that *raises* for an unknown id is indistinguishable from Studio's "execution
   failed" and costs the reader 40 s of retries before "could not reach the network". Please
   return `"null"` (or `{}`) for an unknown id rather than raising.
8. **Field names I map** (snake_case from the views): listing → `seller, title, kind,
   promises (list) | promises_json, hashes (list) | hashes_json, section_count, price,
   window_seconds, created_at, open, orders, kept, broken, unclear`; order → `listing,
   buyer, seller, price, opened_at, deadline_at, status, section_index, promise_index,
   bond, disputed_at, verdict, judged_at, revealed_text, missing_index, missing_at,
   paid_buyer, paid_seller, window_open, bond_required`; ledger rows → the DESIGN compact
   row (`order` as the id); `bond_for` → a bare string or `{bond}`. `section_index` /
   `promise_index` are shown only once a dispute exists, `missing_index` only when
   `missing_at` is set (u32 cannot hold -1).
9. **Numbers as strings are fine** — everything numeric is coerced; atto values stay strings.
