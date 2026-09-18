# As Described — the delivery API

The contract stores a sha256 per section and moves the money; it never stores the pack.
The site delivers the text: the seller uploads the sections after `list_pack` confirmed,
and a buyer with a paid order fetches them. Three route handlers under
`app/api/packs/[id]/…` (node runtime, `[id]` is a listing id such as `L3`), one helper
route `GET /api/snapshot`.

Every answer is JSON with `ok: boolean` and, on a refusal, a plain-English `reason`.
The blob URL is never part of any answer.

## Routes

### `GET /api/packs/[id]/status`

`→ 200 { ok: true, uploaded: boolean }`. No wallet, no chain read. Says only whether a
stored body exists for this listing. `400` for an id that is not `L<digits>`.

### `POST /api/packs/[id]/upload`

Body `{ sections: string[], address: "0x…", signature: "0x…" }`.

The signed message (`personal_sign`, UTF-8, `\n` between lines, no trailing newline):

```
As Described
action: upload-pack
listing: L3
manifest: <sha256 hex of the listing's hashes joined by ",">
```

Order of checks and answers:

| check | code | reason |
|---|---|---|
| id is `L<digits>`, body is JSON, address is `0x` + 40 hex, 1–20 sections, each 1–4000 chars | 400 | which one failed |
| the listing exists on chain | 404 | `listing L3 does not exist` |
| the chain answered at all (8 tries over ~40 s) | 503 | `could not reach the network` |
| `address` equals the listing's `seller` | 403 | `only the listing's seller may upload its pack` |
| section count equals the committed count | 409 | `the listing commits 8 sections, 3 were sent` |
| `sha256(sections[i]) == hashes[i]` for every i (exact bytes, no trimming) | 409 | `section 5 does not hash to what the listing committed` |
| the signature recovers to `address` for the message above (viem `verifyMessage`) | 401 | `the signature does not match the upload message for this listing` |
| stored | 200 | `{ ok: true, listing, sections: <count> }` |
| storage failed | 500 | `the pack could not be stored` |

Uploading again overwrites (the hashes are fixed by the listing, so the content can only be
the same bytes again).

### `POST /api/packs/[id]/pack`

Body `{ order: "O7", address: "0x…", signature: "0x…" }`.

The signed message:

```
As Described
action: read-pack
order: O7
```

| check | code | reason |
|---|---|---|
| ids and address well-formed, body is JSON | 400 | which one failed |
| the signature recovers to `address` | 401 | `the signature does not match the read message for this order` |
| the order exists on chain | 404 | `order O7 does not exist` |
| the chain answered | 503 | `could not reach the network` |
| `order.listing == [id]` | 403 | `order O7 is not for listing L3` |
| `address == order.buyer` | 403 | `only the order's buyer may read this pack` |
| a pack was uploaded | 404 | `the seller has not uploaded this pack yet` |
| ok | 200 | `{ ok: true, order, listing, sections: string[], uploadedAt }` |
| the stored body cannot be opened (wrong `PACK_SECRET`) | 500 | `the stored pack could not be opened` |

The signature is valid for the order for ever (there is no nonce): it grants reading a pack
the buyer already paid for, nothing else. The order page caches it in `localStorage` under
`as-described.read-sig.<order>` so the wallet is asked once per order.

### `GET /api/snapshot`

Serves `data/snapshot.json` (read from disk at request time) or `404 { ok: false }` when
the site ships none. `lib/chain.ts` asks for it only after a live read failed every retry,
and returns the item with `source: "snapshot"` so the page can label it. Route handlers
never use the snapshot: an upload or a read is authorised by the chain or not at all.

## Client helpers (`lib/api.ts`)

`packStatus(listing)`, `uploadPack(listing, sections, address, signature)`,
`fetchPack(listing, order, address, signature)`, plus `uploadMessage(listing, manifest)`,
`readMessage(order)`, `sha256Hex(text)` (WebCrypto) and `manifestOf(hashes)`. A fetch that
does not reach the site comes back as `{ ok: false, reason: "could not reach the site" }`;
nothing throws.

## Storage (`lib/store.ts`)

- `BLOB_READ_WRITE_TOKEN` set → Vercel Blob, pathname `packs/<id>.json`,
  `addRandomSuffix: false`, `allowOverwrite: true`, public access; reads bypass the CDN cache.
- otherwise → `.data/packs/<id>.json` under the project root (`.data/` is created on first
  write and git-ignored). This is the dev store; on Vercel the filesystem is not durable, so
  set the token there.

Ids are checked against `^L\d{1,9}$` before they touch a path or a pathname.

## Encryption at rest (`lib/crypto.ts`)

The stored body is an envelope:

```
{ "v": 1, "alg": "aes-256-gcm", "iv": <base64 12 bytes>, "tag": <base64 16 bytes>, "data": <base64> }
```

Key = `scrypt(PACK_SECRET, "as-described", 32 bytes, N=16384, r=8, p=1)`, a fresh random IV
per write, GCM tag verified on read (a wrong key or a changed byte fails, it never yields
garbage). A public blob URL therefore leaks nothing but the size.

With `PACK_SECRET` **unset** the envelope is `{ "v": 1, "alg": "none", "data": … }`: plaintext,
for local development only. A plaintext envelope still opens after a secret is set; an
encrypted one cannot be opened with a different secret, and there is no re-keying.

## Mock mode (`NEXT_PUBLIC_MOCK=1`)

The routes honour the same flag as the pages: chain checks go to `lib/chain-mock.ts`
(the demo listings there carry the real sha256 of `lib/demo-packs.ts`), storage and
encryption work as above. Because nobody has a key for the mock seller
(`0x0a9fd8fe…`) or buyer (`0x449ab0b8…`), **in mock mode and only in mock mode** a request
with an empty `signature` is accepted when `address` passes the chain check (seller for
upload, buyer for read). A non-empty signature is still verified. Never set the flag on a
deployed site; without it an empty signature is `401`.

## What the site is a trust point for, and what bounds it

The site holds the text between upload and delivery. What it cannot do:

- **Change what a buyer receives without it showing.** Every section's sha256 is on chain
  from before the sale; the order page hashes each delivered section in the browser and
  shows a green tick or a red mismatch per section. A modified or swapped section is a red
  mark, and the on-chain hash is what `judge` binds the evidence to, so a changed section
  can never be judged as the pack.
- **Steer a verdict.** `judge(order, section_text)` accepts only text that hashes to the
  committed value; the validators run the model themselves and the contract writes the
  sentence from a closed set. The site is one caller among any.
- **Hold the money.** Escrow, bond, refund and release live in the contract; the site never
  touches value.

What it can do, and the model-free remedy:

- **Withhold or lose a pack.** If the site is down, wrong, or the seller never uploaded,
  the buyer has no text to hash. The contract's `report_missing(order, section_index)`
  (buyer, before the deadline) starts a 24-hour clock; the seller can `reveal` the section
  on chain (it must hash to the commitment, and the deadline extends by 24 h so the buyer can
  still dispute it); if nobody reveals, `refund_missing` (anyone) returns the full price to
  the buyer. No model is asked, so an offline site cannot cost a buyer their money.
- **Read the packs.** The operator with `PACK_SECRET` can decrypt every pack; buyers already
  paid for exactly that text. The secret is the only thing standing between a blob URL and
  the text, which is why the URL never appears in an answer and the body is sealed.

Nothing in the delivery API is authoritative for the contract: who is seller, who is
buyer, what was committed, and whether a section broke a promise are all read from, or
decided on, the chain.
