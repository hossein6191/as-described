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
