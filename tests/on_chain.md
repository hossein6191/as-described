# What was measured on chain

`tests/test_pure.py` covers the boundary, the closed set, the calendar, every validation,
the refunds, the authority rules, the journeys and the static rules — 44 tests, no network
(`~/gl-primitives/.venv/bin/python -m pytest tests/ -q`). `tools/mutate.py` removed 50
defences one at a time and every mutant was killed (`tests/MUTATIONS.md`). Neither can reach
the question this contract exists to answer: whether independent validators, each reading
the same promise and the same hash-bound section in both framings, arrive at the **same
verdict**. That is what `tests/on_chain/smoke.mjs` measures.

```
node tests/on_chain/smoke.mjs        # 18 September 2026, Studio 61999, throwaway accounts
```

The suite deploys a throwaway As Described of its own each run, so its address is not the
deployment the site points at; the owner signs the real one.

## Run 1 — 18 September 2026 (cut short by the build harness, not by the network)

```
deploy tx  0x29282d54eefc668bdccc3eb98f0e5dbabedae33392ed1f132c57c4dc13e433b1
contract   0xA1abE645e6454E7A7128005877923f1A9DC51652
seller     0xC39d06941d9e76957E00748d9a5e42Aa6783954F   (throwaway, funded 400 GEN by sim_fundAccount)
buyer      0x403787B81B15267212E4ac591e9f739068B12711
stranger   0xB2fD3684F107a0474598C6Bae911f8F39d903d34
```

| step | tx | votes | result |
|---|---|---|---|
| deploy | `0x29282d54…` | accepted | contract `0xA1abE645…` |
| `list_pack` with a two-letter title | `0x9f60f64b…` | 3 agree, 0 disagree, 2 idle | refused: *a title is 3 to 60 characters* |
| `list_pack` with a hash that is not 64 lowercase hex | `0xebd4dc15…` | 3 agree, 0 disagree, 2 idle | refused: *each hash is the sha256 of one section: 64 lowercase hex characters* |
| `list_pack` with a price below 0.1 GEN | `0x30998ab8…` | 3 agree, 0 disagree, 2 idle | refused: *the price is a whole number of atto between …* |

Three of three steps passed before the builder's session was closed by the workflow
harness while the run was still in progress (each Studio transaction takes 30–60 s to
finalise; the full run is about twenty). **The remaining steps — the two packs, the wrong-
value buy and its refund, the stranger's dispute and its refund, the wrong-text judge, the
`breaks` and `keeps` verdicts with their tallies and balance movements, the 300-second
release, and missing → reveal — were not reached and are not claimed.** The raw log is in
`tests/on_chain/smoke-run1.log`.

To continue against the same deployment without redeploying (each phase lists its own pack
and reads the ids the contract assigns):

```
AS_DESCRIBED=0xA1abE645e6454E7A7128005877923f1A9DC51652 PHASE=A node tests/on_chain/smoke.mjs
AS_DESCRIBED=0xA1abE645e6454E7A7128005877923f1A9DC51652 PHASE=B node tests/on_chain/smoke.mjs
AS_DESCRIBED=0xA1abE645e6454E7A7128005877923f1A9DC51652 PHASE=C node tests/on_chain/smoke.mjs
```

What run 1 does establish: the contract deploys on Studio 61999 with the old SDK runner
`1jb45…` (so `bool` fields in a storage dataclass and `TreeMap[str, bool]` are accepted at
deploy), `[EXPECTED]` refusals in `list_pack` are deterministic across validators (3 agree,
0 disagree on each), and the receipt carries the plain sentence the site can show as is.

## Run 2 — 18 September 2026, phases A, B and C on the same deployment (36 / 36)

Same throwaway register `0xA1abE645e6454E7A7128005877923f1A9DC51652`; fresh throwaway seller, buyer and stranger
accounts (see the head of `tests/on_chain/smoke-run2.log`). Every judged call and every refusal below is a
signed transaction; balances were read from `eth_getBalance` after finalization.

| phase | step | tx | votes | outcome |
|---|---|---|---|---|
| A | a two-letter title is refused | `0x1ed0f72e…` | 4 agree, 0 disagree, 1 idle | [EXPECTED] a title is 3 to 60 characters |
| A | a hash that is not 64 lowercase hex is refused | `0x3c483019…` | 3 agree, 0 disagree, 2 idle | [EXPECTED] each hash is the sha256 of one section: 64 lowercase hex ch |
| A | a price below 0.1 GEN is refused | `0xff1d24a0…` | 5 agree, 0 disagree, 0 idle | [EXPECTED] the price is a whole number of atto between 100000000000000 |
| A | pack 1 is listed with a contract-assigned id | `0x0fd565c3…` | 3 agree, 0 disagree, 2 idle | L2 · 3 agree, 0 disagree, 2 idle |
| A | buy with the wrong value is refused, and the record says so | `0x0deea6df…` | 3 agree, 0 disagree, 2 idle | send exactly the price: 1000000000000000000 atto; your funds were retu |
| A | the refund is real: the buyer's balance is back where it was | view | — |  |
| A | buy pack 1 for 1 GEN opens an order | `0x17454578…` | 5 agree, 0 disagree, 0 idle | O1 · deadline 2026-09-21T13:28:55Z |
| A | bond_for reads the bond with no model | view | — | 200000000000000000 |
| A | a stranger cannot dispute, and the bond comes back | `0x4d936b31…` | 3 agree, 0 disagree, 2 idle | only the buyer of this order may dispute it; your funds were |
| A | the buyer disputes recipe 5 against promise 1 with the bond | `0x623687c5…` | 3 agree, 0 disagree, 2 idle | 3 agree, 0 disagree, 2 idle |
| A | judge with a text that does not hash to the commitment is refused | `0xe39d6636…` | 3 agree, 0 disagree, 2 idle | [EXPECTED] the text does not match the hash the seller committed for section 5 |
| A | the validators judge recipe 5 and agree | `0xab47dff8…` | 3 agree, 0 disagree, 2 idle | 3 agree, 0 disagree, 2 idle → breaks (break: yes, keep: no) |
| A | bacon breaks the vegetarian promise | view | — |  |
| A | and the buyer received the price plus the bond | view | — | +120 / 100 GEN |
| A | order view: settled, verdict breaks, paid_buyer 1.2 GEN | view | — |  |
| A | a verdict is final | `0x29853f35…` | 3 agree, 0 disagree, 2 idle |  |
| B | pack 2 is listed | `0x9265f2c8…` | 3 agree, 0 disagree, 2 idle | L3 |
| B | buy pack 2 | `0x5704a36a…` | 4 agree, 0 disagree, 1 idle | O2 |
| B | the buyer disputes recipe 3 against the 30-minute promise | `0x87253a43…` | 3 agree, 0 disagree, 2 idle | 3 agree, 0 disagree, 2 idle |
| B | the validators judge recipe 3 and agree | `0x1ade5d6b…` | 3 agree, 1 disagree, 1 idle | 3 agree, 1 disagree, 1 idle → keeps (break: no, keep: yes) |
| B | a 15-minute recipe keeps the 30-minute promise | view | — |  |
| B | and the seller received the price plus the bond | view | — | +120 / 100 GEN |
| C | pack 3 is listed with a 300 s window | `0x4c4a249b…` | 3 agree, 0 disagree, 2 idle | L4 |
| C | buy pack 3 | `0x0c8f7817…` | 3 agree, 0 disagree, 2 idle | O3 · deadline 2026-09-18T13:41:44Z |
| C | release before the deadline is refused | `0x0f3db720…` | 3 agree, 0 disagree, 2 idle | [EXPECTED] the dispute window is open until 2026-09-18T13:41:44Z |
| C | a second order on pack 3 | `0x06fd5353…` | 3 agree, 0 disagree, 2 idle | O4 |
| C | a stranger cannot report a section missing | `0x8c8c166b…` | 5 agree, 0 disagree, 0 idle |  |
| C | the buyer reports template 2 missing | `0x826034f0…` | 3 agree, 0 disagree, 2 idle |  |
| C | a reveal that does not hash to the commitment is refused | `0xa26e3b35…` | 5 agree, 0 disagree, 0 idle |  |
| C | the seller reveals template 2 and the order is paid again | `0x3bc23b09…` | 3 agree, 0 disagree, 2 idle | deadline now 2026-09-19T13:40:28Z |
| C | order view: paid, the revealed text is on chain, the deadline moved out by a day | view | — |  |
| C | release after the deadline pays the seller | `0xaf553da0…` | 3 agree, 0 disagree, 2 idle | 3 agree, 0 disagree, 2 idle |
| C | and the seller received 0.5 GEN | view | — |  |
| C | stats reads the counters | view | — | {"listings":4,"orders":4,"kept":1,"broken":1,"unclear":0,"refunded":0,"released":1,"stale":0} |
| C | ledger reads the last orders newest first | view | — | O4:paid O3:released O2:settled O1:settled |
| C | the rules are published by the contract | view | — |  |

What the run establishes beyond run 1:
- **`breaks` verdict** (phase A, judge `0xab47dff8…`): 3 agree / 0 disagree; the buyer received the price plus the bond (+1.2 GEN) after finalization; the verdict is final (a second judge on the same order is refused).
- **`keeps` verdict** (phase B): 3 agree / **1 disagree** / 1 idle — the majority stored `keeps` (break: no, keep: yes) and the seller received the price plus the bond. One validator disagreed on an honest 15-minute recipe against a 30-minute promise; a split of this size is what the two-framing rule is there to absorb, and it is reported as measured, not hidden.
- **Refunds are real**: a wrong-value `buy` and a stranger's `open_dispute` were refused with `ok:false` and the value came back (gas only).
- **`release`** is refused while the window is open and pays the seller after it (0.5 GEN received).
- **missing → reveal**: a stranger cannot report; the buyer's report stores `missing`; a reveal with the wrong bytes is refused; the right bytes put the order back to `paid` with the text on chain and the deadline moved out a day.
- `stats`, `ledger` and `rules` read without a model.

Not exercised on chain, by design: `refund_missing` and `settle_stale` (both need 24 hours) — covered offline in `tests/test_pure.py`.
