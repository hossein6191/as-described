# What was measured on chain

`tests/test_pure.py` covers the boundary, the closed set, the calendar, every validation,
the refunds, the authority rules, the consensus closures against a stubbed model, the
sentence the contract writes, the journeys and the static rules: 84 tests, no network
(`pytest tests/ -q`). `tools/mutate.py` removed or inverted 83 defences one at a time and
every mutant was killed (`tests/MUTATIONS.md`). Neither can reach the question this contract
exists to answer: whether independent validators, each reading the same promise and the same
hash-bound section in both framings, arrive at the **same verdict**. That is what the two
runs below measure.

```
node tests/on_chain/smoke.mjs                    # deploys its own register, then 69 checks
CONTRACT=0x… node tests/site/e2e.mjs             # the same journey through a browser
```

Neither run ever touches the register the site ships. `smoke.mjs` deploys a throwaway of its
own, `e2e.mjs` refuses to start without a `CONTRACT` that is not the site's, and every wallet
in both runs is generated inside the run and funded by `sim_fundAccount`.

## The run, 23 September 2026, GenLayer Studio chain 61999

Both runs went against **a throwaway register with the same bytes** as
`contracts/as_described.py` and `public/contracts/as_described.py`
(sha256 `eda078db37dcd15ed5efed0e62c35e48d355b12539ec8c2558b74fa0223fe803`), deployed by the
smoke run itself, tx
[`0x8b7a4e86…`](https://explorer-studio.genlayer.com/tx/0x8b7a4e86a04177b39764b8c50ced63f0808457b22905f95a3c370e0778d777b6).
Its address is deliberately not written down here: it is scratch, it will not exist for
anyone's review, and the repository names one register only, the one the site reads. The
transaction hashes are what prove the run, and they are all on the Studio explorer.

Totals: **69 checks passed, 0 failed** and 39 signed calls in the smoke run, plus
**12 of 12 browser steps** and 14 more signed transactions in the site run. The raw smoke log
is `tests/on_chain/smoke-run3.log`, with the register lines removed for the same reason.

### Refusals, each one a signed transaction

| step | tx | votes | receipt |
|---|---|---|---|
| a two-letter title | [`0x1c697ba8…`](https://explorer-studio.genlayer.com/tx/0x1c697ba8768103b200aefd7d5f0333f58ff3f09f8d827fe558a74c7dce9e1064) | 3 agree, 0 disagree, 2 idle | `[EXPECTED] a title is 3 to 60 characters` |
| a hash that is not 64 lowercase hex | [`0x6321336a…`](https://explorer-studio.genlayer.com/tx/0x6321336a7ddb14234e097e7c49b026ca8873f94ee679852bca7448f3d70399f6) | 3 agree, 0 disagree, 2 idle | `[EXPECTED] each hash is the sha256 of one section` |
| a price below 0.1 GEN | [`0x883bdfbc…`](https://explorer-studio.genlayer.com/tx/0x883bdfbcea565a809e283e87c321b4c01b940be19e835ddf27c210c6353229a8) | 5 agree, 0 disagree, 0 idle | `[EXPECTED] the price is a whole number of atto between …` |
| a promise carrying a line break | [`0x7be28b36…`](https://explorer-studio.genlayer.com/tx/0x7be28b36e0c05e4e3bdc778a38cc631a8c4848bdd0d8c733ac9e5910313529f0) | 5 agree, 0 disagree, 0 idle | `[EXPECTED] each promise is one line, with no line breaks` |
| `buy` with the wrong value | [`0x77cfc25e…`](https://explorer-studio.genlayer.com/tx/0x77cfc25e54184a5e2fea04965183cb9a56be1fd4f4d890589a58765cda622b3d) | 5 agree, 0 disagree, 0 idle | `send exactly the price …; your funds were returned` |
| a stranger's `open_dispute` | [`0xd8a4c414…`](https://explorer-studio.genlayer.com/tx/0xd8a4c4146ce2de84199bb59b447358dd6d694296cdc748376f81c92c5593db8d) | 5 agree, 0 disagree, 0 idle | `only the buyer of this order may dispute it; your funds were returned` |
| `judge` with text that does not hash | [`0xa4b60fb3…`](https://explorer-studio.genlayer.com/tx/0xa4b60fb3b1ff549b634d40afe9752487c29d020b2b96440150fa815efcb69acc) | 5 agree, 0 disagree, 0 idle | `[EXPECTED] the text does not match the hash the seller committed for section 5` |
| `judge` a second time | [`0x6ff77aa9…`](https://explorer-studio.genlayer.com/tx/0x6ff77aa99fa96800d9ca78bc6610352fe5dc1ffc8cba594ed2b66d0d8b1dba3c) | 3 agree, 0 disagree, 2 idle | a verdict is final |
| a stranger's `withdraw_dispute` | [`0x4e2c709a…`](https://explorer-studio.genlayer.com/tx/0x4e2c709ad5b7ec063083a78ad6161a78138578f47ddaa0697bc57ffed124e309) | 3 agree, 0 disagree, 2 idle | `[EXPECTED] only the buyer of this order may withdraw its dispute` |
| `withdraw_dispute` on a paid order | [`0x3eff9075…`](https://explorer-studio.genlayer.com/tx/0x3eff9075f9bbe916b5c424dac7926476108c4a2689fe8dcedfe6272ea594a416) | 3 agree, 0 disagree, 2 idle | `[EXPECTED] only a disputed order can be withdrawn; this one is paid` |
| `release` before the deadline | [`0xd2487d49…`](https://explorer-studio.genlayer.com/tx/0xd2487d4986d8840cf29b8ce103565a103877acaaa24d3535ee30dcb9a6bfea99) | 5 agree, 0 disagree, 0 idle | `[EXPECTED] the dispute window is open until …` |
| a stranger's `report_missing` | [`0x541c75e2…`](https://explorer-studio.genlayer.com/tx/0x541c75e2c59bd3d0cd7df1eac3ae6c46830d30aa8b1d8803c2403ad1bc305d84) | 5 agree, 0 disagree, 0 idle | only the buyer |
| a `reveal` that does not hash | [`0xc7899086…`](https://explorer-studio.genlayer.com/tx/0xc78990865d33644b370cf308f940f144fa900cdd39970291da7cf84fe2b40a18) | 5 agree, 0 disagree, 0 idle | the bytes must match the commitment |
| re-reporting a section already on chain | [`0xd9e361b7…`](https://explorer-studio.genlayer.com/tx/0xd9e361b750424f29dff82ec24f8330ffbbe50e6bb33e9afe31dc20f8237f134f) | 5 agree, 0 disagree, 0 idle | `[EXPECTED] section 2 is already on chain; read it from the order` |
| a fourth `report_missing` on one order | [`0x973a25bf…`](https://explorer-studio.genlayer.com/tx/0x973a25bf2644368d9f57b4e40b9b0cd720f28980717652f725f7265aa4493b45) | 3 agree, 0 disagree, 2 idle | `[EXPECTED] a buyer reports at most 3 sections missing per order` |

The two payable refusals were checked against balances, not only against the receipt: the
buyer's and the stranger's balances came back to exactly where they started, so a refused
payable call really does return the value in the same transaction.

### Verdicts and money

| step | tx | votes | outcome |
|---|---|---|---|
| a bacon recipe against "every recipe is vegetarian" | [`0x8020a4f4…`](https://explorer-studio.genlayer.com/tx/0x8020a4f4ed4a0f65aeda4fe8a9036de42feb685089cc59174f40aeecbfa7aae8) | 3 agree, 1 disagree, 1 idle | `breaks` (break yes, keep no); the buyer received +1.2 GEN |
| a 15-minute recipe against "30 minutes or less" | [`0x86b1a79c…`](https://explorer-studio.genlayer.com/tx/0x86b1a79c71875e3bc15212e368344030c4750cc83d0938cfc97577971ad9e1f5) | 3 agree, 0 disagree, 2 idle | `keeps` (break no, keep yes); the seller received +1.2 GEN |
| a section of 12,283 characters, past the published cap | [`0x8fb2660b…`](https://explorer-studio.genlayer.com/tx/0x8fb2660bd604dbf63ea6995f02bcbdafddf2aa652310ec0e7f3ee6905d9c4142) | 3 agree, 0 disagree, 2 idle | `breaks` by rule, `by_rule: true`, both framing answers empty; the buyer received +0.6 GEN |
| `release` after the window closed | [`0xb47bf9a3…`](https://explorer-studio.genlayer.com/tx/0xb47bf9a36c3a7c4977228ae69f8f90b4a52012346f5128ef868f2a3a1e33a211) | 5 agree, 0 disagree, 0 idle | the seller received 0.5 GEN |

Every payout above was read from `eth_getBalance` after finalization, not from the receipt.
Each settled order was then read back and its `verdict_line` compared with the exact string the
contract is expected to build. Three examples, character for character:

```
A majority of the validators found that section 5 breaks promise 1, so the buyer got the price and the bond back: 1.2 GEN.
A majority of the validators found that section 3 keeps promise 2, so the seller got the price and the bond: 1.2 GEN.
The dispute window closed with no dispute, so the seller got the price: 0.5 GEN.
```

The first two carry no word from the pack: the run asserts that the words "bacon" and "Recipe"
are absent from them. The by-rule sentence says so in as many words, that the dispute was
settled without asking the validators.

### The paths the audit added, proven on chain

- **A buyer can leave a dispute.** [`0xa594480a…`](https://explorer-studio.genlayer.com/tx/0xa594480ad1b1dfdd7f44ff98e8d9db7e71ec95d11e3cbb78b47d3337fcdfe789):
  the bond came back to the buyer's wallet, the order read `paid` with bond 0, and the
  deadline was unchanged. A stranger and a paid order are both refused (the table above).
- **Studio carries an oversize argument.** The remedy for a section committed past the
  4000-character cap rested on an assumption about calldata capacity that nothing in the
  repository had measured. 12,283 characters were sent in one `judge` and applied. The plan's
  figure of 16,000 is still untested and is not claimed here; 12,283 is, which is three times
  the cap.
- **A section on chain stays on chain.** Report, reveal, then report the same section again:
  refused. A different section may still be reported, and `order()` lists every revealed
  section by index, `[{index: 1, …}, {index: 3, …}]`.
- **The walk across a pack is capped.** The third report was accepted with
  `missing_reports: 3` and `missing_reports_left: 0`
  ([`0xf39d611e…`](https://explorer-studio.genlayer.com/tx/0xf39d611ed9e700e5f232265bc6402290d3bb03d0a571cb013572e546890b213f));
  the fourth was refused.
- **One call reads a shelf.** `listings(offset, limit)` returned the same rows as `listing()`
  row for row, paged by offset, clamped a limit that was not a number, and returned no rows
  past the end, all with no model.

### The browser run

`tests/site/e2e.mjs`, 12 steps, all passing, 808 seconds, 14 signed transactions through a
fake wallet against the same register.

- **The faucet, which was the open blocker.** The wallet reported a lowercase address and the
  site sent `sim_fundAccount` the checksummed one; the balance went from 0 to 10 GEN in 3 s,
  and a second call from the wallet menu moved it again.
- **A demo pack lists with zero `personal_sign` calls**, and its buyer read all six sections
  after one signature with 6 of 6 hashes matching.
- **Two verdicts through the UI**: `keeps` on a 3 agree, 1 disagree, 1 idle round with 0.6 GEN
  to the seller, and `breaks` with 1.2 GEN landing in the buyer's wallet while the page watched
  the balance. Both verdict cards showed the sentence the contract stored and the exact text
  the validators read.
- **A pack deliberately never uploaded**: the order page showed 0 of 3 undelivered, the buyer
  reported section 2 missing, the seller revealed it on chain, and the revealed row then lost
  its report button and gained the dispute button. Judging it paid the buyer 0.6 GEN.
- **The rails were observed, not inferred**: PENDING, PROPOSING, COMMITTING, REVEALING,
  ACCEPTED, FINALIZED, with a chip per validator.
- **The delivery API's register vetting ran in a browser**: three made-up registers answered
  400, a fourth from the same caller answered 503, and the site's own register kept answering
  200 throughout.
- **375 x 812**: `/order` and `/sell` had `scrollWidth` 375 with no horizontal scroll, and the
  promise dialog fitted and scrolled inside the viewport.
- A visitor with no wallet read a settled order, verdict card and judged text included.

### The register afterwards

Read back when both runs had finished:

```
stats()  {"listings":8,"orders":8,"kept":2,"broken":4,"unclear":0,"refunded":0,"released":1,"stale":0}
ledger   O8 breaks 0.6→buyer · O7 breaks 1.2→buyer · O6 keeps 0.6→seller · O5 paid
         O4 released 0.5→seller · O3 keeps 1.2→seller · O2 breaks 0.6→buyer · O1 breaks 1.2→buyer
```

`ledger(50)` returned the rows newest first.

### Network notes worth keeping

A plain call takes roughly 36 to 42 s to FINALIZED and a `judge` 44 to 120 s. Studio allows
30 `gen_call` a minute per client and `sim_fundAccount` shares that bucket; a 429 comes back
with no CORS header, so a browser sees "Failed to fetch". The browser run hit that limit while
the smoke run was sharing the bucket: the site degraded, showed its countdown and carried on,
and the step still passed. `sim_fundAccount` needs a checksummed address. A `gen_call` can
answer "Contract not found" for an existing address for about a minute after a deploy.

## Still not exercised on chain

`refund_missing` and `settle_stale` both need 24 hours to pass, `close_listing` has no step in
either harness, and no run has produced an `unclear` verdict yet (`stats()` reports
`unclear: 0`). All four are covered offline in `tests/test_pure.py`. They are what the owner's
signing run on the new register is for, and whatever `unclear` does there will be recorded as
measured.
