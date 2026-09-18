# Handoff from the order page

What `app/order/[id]/page.tsx` now does around undelivered packs and the missing-section path, and
the one thing it needs from a file it does not own.

## What the page does now

- When `POST /api/packs/<listing>/pack` answers "the seller has not uploaded this pack yet" (or "the
  stored pack could not be opened"), the section list is still drawn from `listing.hashes`, every row
  "not delivered", with a gold box above it that explains the model-free way out and a
  "Section missing? Report it" button per row that sends `report_missing(order, "<0-based index>")`.
  Rows whose text fails the hash check get the same button. Rows that arrived intact keep
  "This breaks a promise". The read signature is kept in localStorage in that case (it was valid).
- Status `missing`: the reported row is marked, the card says "the seller has until <missing_at + 24 h>",
  the "Full refund" button (`refund_missing`, anyone) is always drawn and enabled only after that time,
  and the seller's reveal textarea stays where it was.
- Status `paid` with `missing_at` and `revealed_text` set (the seller revealed): a card says the section
  was revealed on chain and shows the text.
- After any applied write the page re-reads the order every 3 s (at most 20 times) until the status it
  started from is gone, so the checklist never draws step 2 against a row that still reads "paid".
  While that runs after the bond, step 2 says "Recording the bond…" instead of the paste box.
- `verdictSentence` uses `paid_buyer` / `paid_seller` once settled and is written for the viewer
  (buyer, seller, anyone else).
- `components/ledger-table.tsx`: the When cell prints the status word in muted text when a row has no
  `judged_at` (and no `opened_at`); `lib/format.ts` gained `statusWord()` and `plusHours()`.

## Asked of `lib/chain-mock.ts` (owned by the ui agent)

The mock's `write()` already models `report_missing`, `reveal` and `refund_missing` correctly, and
`mockPackSections()` returning `null` already yields the "not delivered" rows. What is missing is a
way to reach that state: every mock listing has its pack stored, and `/sell` stores the pack in the
same call as `list_pack`, so in mock mode no order ever shows an undelivered section and the
report → reveal → refund buttons cannot be clicked. Please add one demo listing whose hashes are
committed but whose pack is not in `packs` (say `L4`, price 1 GEN, three sections), with one order on
it in escrow (`O6`), so the missing path can be walked in the browser. Mock mode plays both sides
already: the page treats the mock viewer as buyer and seller at once, so the reveal box appears
without a wallet.
