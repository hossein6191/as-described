"""Remove each defence of contracts/as_described.py in turn and record the test that killed it.

    ~/gl-primitives/.venv/bin/python tools/mutate.py     # writes tests/MUTATIONS.md; exit 1 if any mutant survives
The harness refuses to run over a failing baseline, and treats a mutant that
does not even import as a broken anchor, never as a kill. The suite reads the
contract from AS_DESCRIBED_SOURCE, which is how each mutant is fed to it.
"""
import os, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / "contracts" / "as_described.py").read_text(encoding="utf-8")
PYTEST = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider", str(ROOT / "tests" / "test_pure.py")]

MUTATIONS = [
    # --- the prompt boundary
    ("fence does nothing", 'return str(raw).replace("<", "(").replace(">", ")")', 'return str(raw)'),
    ("fence deletes instead of replacing", 'return str(raw).replace("<", "(").replace(">", ")")', 'return str(raw).replace("<", "").replace(">", "")'),
    ("the promise goes in unfenced", '"<<<PROMISE>>>\\n" + _fence(promise_text)[:MAX_PROMISE_CHARS]', '"<<<PROMISE>>>\\n" + promise_text[:MAX_PROMISE_CHARS]'),
    ("the section goes in unfenced", '"<<<SECTION>>>\\n" + _fence(section_text)[:MAX_SECTION_CHARS]', '"<<<SECTION>>>\\n" + section_text[:MAX_SECTION_CHARS]'),
    ("the section is not capped before the prompt", '_fence(section_text)[:MAX_SECTION_CHARS]', '_fence(section_text)'),
    ("the second framing is the first framing", 'question = QUESTION_BREAK if framing == "break" else QUESTION_KEEP', 'question = QUESTION_BREAK'),
    ("the leader asks the BREAK question twice", 'section_text, section_no, section_total, "keep"), response_format="json")', 'section_text, section_no, section_total, "break"), response_format="json")'),
    # --- the closed set
    ("the answer may be anything", '    if answer not in ANSWERS:\n        raise gl.vm.UserError(ERROR_LLM + " the judge answered outside the set: " + answer[:40])\n', ''),
    ("a disagreement between the framings is forgiven", '    if breaks_answer == "yes" and keeps_answer == "no":\n        return "breaks"', '    if breaks_answer == "yes":\n        return "breaks"'),
    ("the round's verdict is not checked against the set", '        if verdict not in VERDICTS:\n            raise gl.vm.UserError(ERROR_LLM + " the round returned no verdict")\n', ''),
    ("the validator agrees with anything", '            return str(theirs.get("verdict", "")) == mine["verdict"]', '            return True'),
    ("the validator does not wrap its own run", '            try:\n                mine = leader_fn()\n            except Exception:\n                return False\n', '            mine = leader_fn()\n'),
    # --- listing
    ("an uppercase hash is accepted", 'all(ch in HASH_CHARS for ch in raw)', 'all(ch.lower() in HASH_CHARS for ch in raw)'),
    ("any number of promises is accepted", 'len(raw) < MIN_PROMISES or len(raw) > MAX_PROMISES', 'len(raw) < MIN_PROMISES'),
    ("a price below the floor is accepted", '        if price < MIN_PRICE or price > MAX_PRICE:', '        if price < 0 or price > MAX_PRICE:'),
    ("a window outside the range is accepted", '        if window < MIN_WINDOW or window > MAX_WINDOW:', '        if window < 0:'),
    ("anyone may close a listing", '        if gl.message.sender_address != listing.seller:\n            _fail("only the seller closes a listing")\n', ''),
    # --- buying
    ("a closed listing still sells", '        elif not listing.open:\n            problem = "this listing is closed"\n', ''),
    ("the seller may buy their own pack", '        elif sender == listing.seller:\n            problem = "a seller does not buy their own pack"\n', ''),
    ("any value buys", '        elif int(value) != int(listing.price):', '        elif False:'),
    ("a purchase with no readable clock is accepted", '            problem = "send exactly the price: " + str(int(listing.price)) + " atto"\n        elif now_seconds < 0:\n            problem = "the network clock could not be read; try again"\n', '            problem = "send exactly the price: " + str(int(listing.price)) + " atto"\n'),
    ("a refused buy keeps the money", '            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        deadline = now_seconds', '            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        deadline = now_seconds'),
    # --- dispute
    ("a stranger may dispute", '        elif sender != order.buyer:\n            problem = "only the buyer of this order may dispute it"\n', ''),
    ("a dispute after the deadline is accepted", '        elif now_seconds >= int(order.deadline_seconds):\n            problem = "the dispute window closed at " + str(order.deadline_at)\n', ''),
    ("a dispute on a settled order is accepted", '        elif order.status != STATUS_PAID:\n            problem = "only a paid order can be disputed; this one is " + str(order.status)\n', ''),
    ("a section index out of range is accepted", '        elif section < 0 or section >= self._section_count(str(order.listing)):', '        elif section < 0:'),
    ("no bond is required", '        elif int(value) != _bond_for_price(int(order.price)):', '        elif False:'),
    ("a refused dispute keeps the bond", '            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        order.status = STATUS_DISPUTED', '            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        order.status = STATUS_DISPUTED'),
    # --- judge
    ("judge runs on any status", '        if order.status != STATUS_DISPUTED:\n            if order.verdict:', '        if False:\n            if order.verdict:'),
    ("judge accepts an oversized section", '            _fail("a section is at most " + str(MAX_SECTION_CHARS) + " characters")\n        listing = self._listing', '            pass\n        listing = self._listing'),
    ("judge accepts a text with the wrong hash", '            _fail("the text does not match the hash the seller committed for section " + str(section + 1))\n        digest = ', '            pass\n        digest = '),
    ("the same digest is judged twice", '        if digest in self.judged_digests:\n            _fail("this section and promise were already judged for this order")\n', ''),
    ("breaks pays the seller", '            to_buyer, to_seller = price + bond, 0', '            to_buyer, to_seller = 0, price + bond'),
    ("keeps pays the buyer", '            to_buyer, to_seller = 0, price + bond\n            listing.kept', '            to_buyer, to_seller = price + bond, 0\n            listing.kept'),
    ("unclear keeps the bond", '            to_buyer, to_seller = bond, price', '            to_buyer, to_seller = 0, price + bond'),
    # --- release, missing, stale
    ("release before the deadline", '        if now_seconds < int(order.deadline_seconds):\n            _fail("the dispute window is open until " + str(order.deadline_at))\n', ''),
    ("release of a disputed or missing order", '        if order.status != STATUS_PAID:\n            _fail("only a paid order is released; this one is " + str(order.status))\n', ''),
    ("release with no readable clock", '        if now_seconds < 0:\n            _fail("the network clock could not be read; try again")\n        if now_seconds < int(order.deadline_seconds):', '        if now_seconds < int(order.deadline_seconds):'),
    ("a stranger may report a section missing", '        if gl.message.sender_address != order.buyer:\n            _fail("only the buyer of this order may report a section missing")\n', ''),
    ("a missing report after the deadline", '        if now_seconds >= int(order.deadline_seconds):\n            _fail("the dispute window closed at " + str(order.deadline_at))\n        section = _digits(section_index)', '        section = _digits(section_index)'),
    ("a revealed section can be reported missing again", '        if order.revealed_text and int(order.missing_index) == section:\n            _fail("section " + str(section + 1) + " is already on chain; read it from the order")\n', ''),
    ("a stranger may reveal", '        if gl.message.sender_address != order.seller:\n            _fail("only the seller reveals a section")\n', ''),
    ("reveal accepts a text with the wrong hash", '            _fail("the text does not match the hash the seller committed for section " + str(section + 1))\n        extended = ', '            pass\n        extended = '),
    ("reveal after the 24 hours", '        if now_seconds >= since + REVEAL_HOURS * 3600:\n            _fail("the " + str(REVEAL_HOURS) + " hours to reveal have passed; the buyer may take a refund")\n', ''),
    ("reveal never extends the deadline", '        if extended > int(order.deadline_seconds):', '        if False:'),
    ("refund_missing before the 24 hours", '        if now_seconds < since + REVEAL_HOURS * 3600:\n            _fail("the seller has " + str(REVEAL_HOURS) + " hours from the report to reveal the section")\n', ''),
    ("refund_missing on any status", '        if order.status != STATUS_MISSING:\n            _fail("nothing to refund: the order is " + str(order.status))\n', ''),
    ("settle_stale before the 24 hours", '        if now_seconds < since + STALE_HOURS * 3600:\n            _fail("a dispute may be settled by rule " + str(STALE_HOURS) + " hours after it was opened; judge it instead")\n', ''),
    ("settle_stale pays the bond to the seller", '        to_buyer, to_seller = int(order.bond), int(order.price)', '        to_buyer, to_seller = 0, int(order.bond) + int(order.price)'),
    ("settle_stale on any status", '        if order.status != STATUS_DISPUTED:\n            _fail("nothing stale to settle: the order is " + str(order.status))\n', ''),
]


def _fresh_env(**extra):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    env.update(extra)
    return env


def run(mutant: pathlib.Path) -> str:
    out = subprocess.run(PYTEST, env=_fresh_env(AS_DESCRIBED_SOURCE=str(mutant)), capture_output=True, text=True, cwd=ROOT)
    if out.returncode == 0:
        return ""
    text = out.stdout + out.stderr
    if "error during collection" in text or "IndentationError" in text or "SyntaxError" in text:
        raise RuntimeError("the mutant does not even import; that is a broken anchor, not a killed defence:\n" + text[-600:])
    m = re.search(r"FAILED tests/test_pure\.py::(\S+)", text)
    if not m:
        raise RuntimeError("a test failed but its name could not be read:\n" + text[-800:])
    return m.group(1)


def main() -> int:
    baseline = subprocess.run(PYTEST, env=_fresh_env(), capture_output=True, text=True, cwd=ROOT)
    if baseline.returncode != 0:
        print("the unmutated suite does not pass; a mutation table over a failing suite proves nothing"); print((baseline.stdout + baseline.stderr)[-600:]); return 3
    rows, escaped = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for name, old, new in MUTATIONS:
            if SRC.count(old) != 1:
                print(f"  ! anchor not found exactly once ({SRC.count(old)}): {name}"); return 2
            path = pathlib.Path(tmp) / f"as_described_{len(rows) + len(escaped)}.py"; path.write_text(SRC.replace(old, new), encoding="utf-8")
            killer = run(path); (rows if killer else escaped).append((name, killer))
            print(f"  {'killed ' if killer else 'ESCAPED'}  {name}" + (f"  ← {killer}" if killer else ""))
    if escaped:
        print(f"\n{len(escaped)} mutant(s) escaped; no table written."); return 1
    table = ["# Mutations", "", f"{len(rows)} defences in `contracts/as_described.py`, each removed or inverted in turn, and the test that failed because of it. "
             "Generated by `tools/mutate.py`; it refuses to write this file if any mutant survives, or if the unmutated suite is not green.", "",
             "| defence removed | killed by |", "|---|---|"] + [f"| {n} | `{k}` |" for n, k in rows] + [""]
    (ROOT / "tests" / "MUTATIONS.md").write_text("\n".join(table), encoding="utf-8")
    print(f"\n{len(rows)} / {len(rows)} killed · tests/MUTATIONS.md written"); return 0


if __name__ == "__main__":
    sys.exit(main())
