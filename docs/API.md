# As Described: the delivery API

The contract stores a sha256 per section and moves the money; it never stores the pack.
The site delivers the text: the seller uploads the sections after `list_pack` confirmed,
and a buyer with a paid order fetches them. Three route handlers under
`app/api/packs/[id]/…` (node runtime, `[id]` is a listing id such as `L3`), one helper
route `GET /api/snapshot`.

Every answer is JSON with `ok: boolean` and, on a refusal, a plain-English `reason`.
The blob URL is never part of any answer.

## Routes

### `GET /api/packs/[id]/status`

`→ 200 { ok: true, uploaded: boolean }`. No wallet and no contract view call. A register
other than the site default costs one `gen_getContractCode` the first time it is seen
(`lib/register-param.ts`). The answer is only whether a stored body exists, never its
contents or its location.

| check | code | reason |
|---|---|---|
| id is `L<digits>` | 400 | `bad listing id` |
| the caller's per-minute delivery-check budget (`lib/budget.ts`, 60 a minute, its own count) | 429 | `too many delivery checks from this address in the last minute; try again shortly` |
| `register` is a 0x address | 400 | `register must be a 0x address` |
| the register runs this contract's code | 400 | `register 0x… does not run the As Described contract (its code hashes to …); deploy one from /deploy` |
| Studio knows that address | 400 | `Studio has no contract at 0x… (a register deployed in the last minute may not be visible yet; try again shortly)` |
| the instance may look one more register up | 503 | `the site checked many new registers in the last minute; try again in a minute` |
| the store answered | 500 | `the store did not answer` |
| ok | 200 | `{ ok: true, uploaded: boolean }` |

A `503`, `500` or `429` here is a failed check, not "nothing uploaded": `packStatus()` answers
`{ uploaded: false, checked: false }` and the pages show no delivery badge at all rather than
telling a visitor a delivered pack is missing. The budget is separate from, and much looser
than, the chain-read budget the signed routes spend, because a shop page asks this once per
pack on the shelf; `packStatus()` also reuses one answer for 8 seconds in the tab, so the
three pages that ask about the same pack cost the store one lookup, not three.

### `POST /api/packs/[id]/upload`

Body `{ sections: string[], address: "0x…", signature: "0x…", register: "0x…" }`.

The signed message (`personal_sign`, UTF-8, `\n` between lines, no trailing newline):

```
As Described
Signing proves you are the seller of this listing, so the site stores its sections. It is not a transaction and moves no GEN.
action: upload-pack
site: as-described.vercel.app
chain: 61999
register: 0x2f75c3c4854aebf095711510b7075e8f0805966f
listing: L3
manifest: <sha256 hex of the sent sections' hashes joined by ",">
```

`site` is the host the request reached (a caller cannot claim another site's host and still
reach this one) and `register` is lowercase. Both are rebuilt by the route, never taken from
the body.

Order of checks and answers. Nothing is read from the chain before the id, the register and
the signature pass:

| check | code | reason |
|---|---|---|
| id is `L<digits>`, body is JSON, address is `0x` + 40 hex, 1–20 sections, each 1–4000 characters (code points, as the contract counts them) | 400 | which one failed |
| the register is the site default, or runs this contract's code | 400 / 503 | as in the status table above |
| the signature recovers to `address` for the message above (viem `verifyMessage`) | 401 | `the signature does not match the upload message for this listing on this site and register` |
| the caller's per-minute chain-read budget | 429 | `too many pack requests from this address in the last minute; try again shortly` |
| the listing exists on chain | 404 | `listing L3 does not exist` |
| the chain answered at all | 503 | `could not reach the network` |
| `address` equals the listing's `seller` | 403 | `only the listing's seller may upload its pack` |
| section count equals the committed count | 409 | `the listing commits 8 sections, 3 were sent` |
| `sha256(sections[i]) == hashes[i]` for every i (exact bytes, no trimming) | 409 | `section 5 does not hash to what the listing committed` |
| the hashes are exactly a demo pack's | 200 | `{ ok: true, listing, sections: <count>, stored: "demo" }`, and nothing is stored |
| this deployment has a pack store | 503 | `This deployment has no pack store, so only the demo packs can be listed here…` |
| a guest register is inside the store quota | 503 | `This deployment stores a limited number of packs per register…` |
| stored | 200 | `{ ok: true, listing, sections: <count>, stored: "store" }` |
| storage failed | 500 | `the pack could not be stored` |

Uploading again overwrites (the hashes are fixed by the listing, so the content can only be
the same bytes again).

### `POST /api/packs/[id]/pack`

Body `{ order: "O7", address: "0x…", signature: "0x…", issued: "2026-09-23T11:05Z", register: "0x…" }`.

The signed message:

```
As Described
Signing proves you are the buyer of this order, so the site shows you its sections. It is not a transaction and moves no GEN.
action: read-pack
site: as-described.vercel.app
chain: 61999
register: 0x2f75c3c4854aebf095711510b7075e8f0805966f
listing: L3
order: O7
issued: 2026-09-23T11:05Z
```

`issued` is an ISO-8601 instant to the minute, and the only line the route takes from the
body: everything else is rebuilt from the host, the checked register and the listing in the
path. The route refuses an `issued` that is more than 5 minutes ahead of it or more than 7
days behind it, which is what bounds the signature in time (`READ_SIG_SKEW_MS` and
`READ_SIG_MAX_AGE_MS` in `lib/api.ts`).

| check | code | reason |
|---|---|---|
| ids and address well-formed, body is JSON | 400 | which one failed |
| the register is the site default, or runs this contract's code | 400 / 503 | as in the status table above |
| `issued` is readable and inside its window | 401 | `this signature is older than 7 days or carries no readable time; sign the read message again` |
| the signature recovers to `address` for the message above | 401 | `the signature does not match the read message for this order on this site and register` |
| the caller's per-minute chain-read budget | 429 | `too many pack requests from this address in the last minute; try again shortly` |
| the order exists on chain | 404 | `order O7 does not exist` |
| the chain answered | 503 | `could not reach the network` |
| `order.listing == [id]` | 403 | `order O7 is not for listing L3` |
| `address == order.buyer` | 403 | `only the order's buyer may read this pack` |
| ok | 200 | `{ ok: true, order, listing, sections: string[], uploadedAt }` |
| served from the repository instead of the store | 200 | the same, plus `source: "demo"` and `uploadedAt: ""` |
| a pack was uploaded | 404 | `the seller has not uploaded this pack yet` |
| the stored body cannot be opened (wrong `PACK_SECRET`) | 500 | `the stored pack could not be opened` |

Inside its window the signature is a bearer token: it grants reading a pack the buyer already
paid for, from any client, and nothing ties it to a session or an address other than the
signer's. The order page caches it in `localStorage` under
`ad:sig:<register>:<address>:<order>`, with the `issued` minute beside it, so the wallet is
asked once per order per wallet per register and the entry stops being used when it expires.
An entry under the older key, which named only the order and so could hand one wallet's
signature to another, is deleted when the page loads.

### Demo packs

A listing whose committed hashes are exactly a demo pack's section hashes is answered from
`lib/demo-store.ts`, with no stored body: the text ships with the site in `lib/demo-packs.ts`.
Matching is by the hashes on chain, never by title or id, so a listing that committed
different bytes never receives the demo text. `upload` then answers `stored: "demo"` and
stores nothing; `pack` answers `source: "demo"`. This is what lets a visitor with no blob
store sell and deliver a pack.

### `GET /api/snapshot`

Serves `data/snapshot.json` (read from disk at request time) or `404 { ok: false }` when
the site ships none. `lib/chain.ts` asks for it only after a live read failed every retry,
and returns the item with `source: "snapshot"` so the page can label it. Route handlers
never use the snapshot: an upload or a read is authorised by the chain or not at all.

## Public listing routes (for other websites)

Three read-only ways for any other site to show, and sell, a listing. All three read the
site's own register on the server through `lib/public-listing.ts`. An id the register cannot
hold (above its listing count, or one the contract never writes, such as `L0` or `L007`) is
answered "no such listing" from that count, which is read with one `stats` call at most every
10 seconds and spends no budget; a loop over made-up ids therefore costs nothing per id. Any
other answer (a missing one included) is reused for 60 seconds by every request on the
instance, and a new read (up to two view calls: `listing`, then `seller`) is budgeted at 6 a
minute per caller and 10 a minute per instance (`lib/budget.ts`). When a read cannot start or
gets no answer, an answer up to 10 minutes old stands in, marked stale; with none, each route
answers with its neutral form below. Nothing is signed and nothing private is served: these
are the contract's own public views.

| route | answer | cache |
|---|---|---|
| `GET /embed/[id]` | a compact HTML card: title, price, promises, the stake and how many more buyers it covers, the seller's record, and a button that opens `/pack/[id]` in a new tab (a wallet does not inject into another site's frame) | rendered per request from the shared answer |
| `GET /api/badge/[id]` | `image/svg+xml`: `As Described \| 3 sold · 0 broken · 1.5 GEN staked`, with `· 0.5 GEN paid to buyers` added once the stake has paid one (teal; orange once a promise broke or the stake paid a buyer; grey when closed). A register before stakes shows `sold · kept · broken` | `max-age=60, s-maxage=60` |
| `GET /api/listing/[id]` | JSON, CORS `*`: `{ ok, register, chain_id, read_at, stale_read, listing, seller, links }`. `listing` carries the contract's `listing()` row under the same names (`listing`, `title`, `kind`, `seller`, `price`, `bond`, `promises`, `hashes`, `section_count`, `window_seconds`, `created_at`, `open`, `closed_reason`, `orders`, `kept`, `broken`, `unclear`, `stake`, `slice`, `open_orders`, `capacity`, `free`, `stake_paid`) plus `stakes`, false on a register before stakes, where the stake fields are `null`; `seller` is the `seller(address)` view's answer, `null` when it could not be read; amounts are atto strings | `max-age=60, s-maxage=60` |

`/embed/*` is the only path another site may frame (`next.config.ts`: `frame-ancestors *`
there, `frame-ancestors 'none'` and `X-Frame-Options: DENY` everywhere else). It renders
without the header, footer, wallet or animated background (`components/site-chrome.tsx`),
so there is no control in it a hidden frame could steer. The badge never errors: an unknown
id, a bad id or a failed read is a grey badge with status 200 and a 15-second cache. The JSON
answers `400` for a bad id, `404` for an unknown one and `503` with a `reason` when nothing
could be read. Each pack page carries the snippets in a "Sell it anywhere" box.

## Client helpers (`lib/api.ts`)

`packStatus(listing, { demo })` → `{ uploaded, checked }`, `uploadPack(listing, sections,
address, signature)`, `fetchPack(listing, order, address, signature, issued)`, plus
`uploadMessage(listing, manifest)`, `readMessage(order, listing, issued)`, `issuedNow()`,
`issuedIsFresh(issued)`, `sha256Hex(text)` (WebCrypto) and `manifestOf(hashes)`. Every helper
adds the register the browser reads. A fetch that does not reach the site comes back as
`{ ok: false, reason: "could not reach the site" }`; nothing throws, and `checked: false` is
how a caller is told the site could not find out rather than found nothing.

## Storage (`lib/store.ts`)

- `BLOB_READ_WRITE_TOKEN` set → Vercel Blob, pathname `packs/<register>/<listing>.json`,
  `addRandomSuffix: false`, `allowOverwrite: true`, `access: "private"` (the object is not
  served by URL at all); reads bypass the CDN cache.
- otherwise → `.data/packs/<register>/<listing>.json` under the project root (`.data/` is
  created on first write and git-ignored). This is the dev store; on Vercel the filesystem is
  not durable, so set the token there.
- a bucket with `BLOB_READ_WRITE_TOKEN` but no `PACK_SECRET` is treated as **no store at all**,
  rather than storing plaintext: `upload` then answers the 503 above.

A register other than this deployment's own is a guest, and a guest may keep at most
`MAX_GUEST_PACKS` (25) packs and `MAX_GUEST_BYTES` (2 MiB) here, with at most
`MAX_GUEST_REGISTERS` (50) guest registers storing anything at all. Registers are free to
deploy and Studio GEN is free, so without those one visitor could fill the deployment's bucket
a listing at a time. Replacing a pack the same register already stored is never refused,
because the listing fixes its hashes.

Ids are checked against `^L\d{1,9}$`, and registers against `^0x[0-9a-fA-F]{40}$` (or `mock`),
before they touch a path or a pathname.

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
encrypted one cannot be opened with a different secret, and there is no re-keying. On a
deployment with a blob store the plaintext envelope is refused rather than written.

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

## The `register` parameter (added 19 Sep 2026)

Every request names the register it is about: `register` in the JSON body of `upload` and
`pack`, `?register=` on `status`. The browser sends the address it reads (`lib/register.ts`: the
visitor's own choice from `/deploy`, else the site default). The routes check the chain on that
register and key the stored pack by `(register, listing)`, so a pack uploaded for `L3` on one
register is never served for `L3` on another. Without the parameter the site default applies.

A register that is not the site default is used only once its deployed code is known to be this
contract: the sha256 of `gen_getContractCode` must equal the sha256 of
`public/contracts/as_described.py` or of an earlier release listed in `lib/register-param.ts`.
The answer is remembered per server instance in a bounded map, and "Studio has no contract
there" is kept for 15 seconds only, because that is Studio's answer for about a minute after a
deploy. The lookup itself is a chain read with no signature in front of it, so it is budgeted:
3 unknown registers per caller per minute and 8 for the whole instance.
