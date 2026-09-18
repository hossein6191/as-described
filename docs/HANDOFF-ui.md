# Handoff from the ui builder

Requests for files I do not own. Each one has a local workaround already in place, so nothing blocks.

## infra (lib/chain.ts, lib/api.ts, components/tx-rail.tsx, package.json scripts)

1. **`LedgerRow` has no transaction hash.** The ledger and the per-pack order list link every row to
   `/order/<id>` and every address to the explorer, but there is no explorer *tx* link per row because
   the row carries none. If `readLedger` (or `readOrder`) can expose the buy/judge hashes (for example
   `txHash?: string`, `judgeTxHash?: string`), `components/ledger-table.tsx` will render `TxLink` for them;
   nothing else needs to change.
2. **`packStatus(listingId)` is called once per listing on `/shop` and once on `/pack/[id]`** to show the
   "Not delivered yet" badge. Keep it cheap (a single small GET, no chain read on the server), or the shop
   grid waits on it. Errors are already swallowed as `uploaded: false`.
3. **`next build` fails on this drive until the AppleDouble files are removed from `.next`:**
   Turbopack's persistent cache parses file names in `.next/cache/turbopack` as numbers and chokes on
   `._000123` ("Failed to open database … invalid digit found in string"). macOS writes those on every
   build. A build script line such as `find .next -name '._*' -delete && next build` (or `dot_clean .next`)
   in `package.json` would remove the surprise; I could not edit `package.json`.
4. Mock mode (`NEXT_PUBLIC_MOCK=1`) has no wallet. The pages bypass `WalletGate` and the upload signature
   when `isMock` is true, and `/orders` shows `MOCK_BUYER`'s orders. If `components/wallet.tsx` ever grows a
   mock identity of its own, the `isMock` branches in `components/wallet-gate.tsx`, `app/sell/page.tsx`,
   `app/orders/page.tsx` and `app/order/[id]/page.tsx` can go.

## brand (components/brand/logo.tsx)

- The header uses `<Logo />` inside a `next/link`; the landing uses `<LogoMark size={72} className=… />`.
  Both exports are used as shipped; no change requested.

## Spec decisions where DESIGN.md was silent or disagreed with itself

- Section length on `/sell`: DESIGN §2 says "≤ 1500", §1 says `MAX_SECTION_CHARS = 4000`. The form uses
  **4000** (the contract's limit), so it never refuses what the contract accepts.
- Ledger rows show the seller only on the order page (the table would not fit at 375 px with both).
- `/order/[id]`: the "Section missing?" button appears only on sections that were not delivered or do not
  match the committed hash; sections that match get "This breaks a promise" instead.
- The "Try to get a refund you don't deserve" block links to `/pack/L2` (the honest twin), the id the
  owner's listing order produces; it is a plain link, not a chain read.
- `public/{next,vercel,file,globe,window}.svg` (create-next-app placeholders, no owner) were removed.
