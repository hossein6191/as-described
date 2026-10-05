"""Remove each defence of contracts/as_described.py in turn and record the test that killed it.

    uv run --python 3.12 --with pytest==9.1.1 python tools/mutate.py     # writes tests/MUTATIONS.md; exit 1 if any mutant survives
The harness refuses to run over a failing baseline, and treats a mutant that
does not even import as a broken anchor, never as a kill. The suite reads the
contract from AS_DESCRIBED_SOURCE, which is how each mutant is fed to it. A
mutation is one (old, new) pair, or a list of them when moving a defence takes
two edits; every anchor must appear exactly once in the contract.
"""
import os, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / "contracts" / "as_described.py").read_text(encoding="utf-8")
PYTEST = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider", str(ROOT / "tests" / "test_pure.py")]

MUTATIONS = [
    # --- the prompt boundary
    ("fence does nothing", 'return str(raw).translate(FENCE_TABLE)', 'return str(raw)'),
    ("fence deletes instead of replacing", 'return str(raw).translate(FENCE_TABLE)',
     'return str(raw).translate({ord(ch): None for ch in FENCE_OPENERS + FENCE_CLOSERS})'),
    ("the fence misses the look-alike angle brackets",
     'FENCE_OPENERS + FENCE_CLOSERS + FENCE_NEUTRAL,\n    "(" * len(FENCE_OPENERS) + ")" * len(FENCE_CLOSERS) + "|" * len(FENCE_NEUTRAL),',
     '"<>",\n    "()",'),
    ("the fence misses the chevron ornaments",
     'FENCE_OPENERS + FENCE_CLOSERS + FENCE_NEUTRAL,\n    "(" * len(FENCE_OPENERS) + ")" * len(FENCE_CLOSERS) + "|" * len(FENCE_NEUTRAL),',
     'FENCE_OPENERS[:10] + FENCE_CLOSERS[:10],\n    "(" * 10 + ")" * 10,'),
    ("the delimiters carry no tag of their own", 'tag = _sha256(body)[:FENCE_TAG_CHARS]', 'tag = "0" * FENCE_TAG_CHARS'),
    ("a block's closing line carries another tag", '"<<<" + name + " " + tag + ">>>\\n" + body + "\\n<<<END " + name + " " + tag + ">>>"',
     '"<<<" + name + " " + tag + ">>>\\n" + body + "\\n<<<END " + name + " " + tag[::-1] + ">>>"'),
    ("the promise goes in unfenced", '_block("PROMISE", _fence(promise_text)[:MAX_PROMISE_CHARS])', '_block("PROMISE", promise_text[:MAX_PROMISE_CHARS])'),
    ("the section goes in unfenced", '_block("SECTION", _fence(section_text)[:MAX_SECTION_CHARS])', '_block("SECTION", section_text[:MAX_SECTION_CHARS])'),
    ("the section is not capped before the prompt", '_fence(section_text)[:MAX_SECTION_CHARS]', '_fence(section_text)'),
    ("the second framing is the first framing", 'question = QUESTION_BREAK if framing == "break" else QUESTION_KEEP', 'question = QUESTION_BREAK'),
    ("the leader asks the BREAK question twice", 'section_text, section_no, section_total, "keep"), response_format="json")', 'section_text, section_no, section_total, "break"), response_format="json")'),
    ("a promise may span lines", '            if text.splitlines() != [text]:\n                return [], "each promise is one line, with no line breaks"\n', ''),
    # --- the closed set
    ("a boolean answer is mapped the wrong way round", '        value = "yes" if value else "no"', '        value = "no" if value else "yes"'),
    ("a view argument of any length is read as a number", '    if not s or len(s) > 40 or any(ch not in "0123456789" for ch in s):',
     '    if not s or any(ch not in "0123456789" for ch in s):'),
    ("the answer may be anything", '    if answer not in ANSWERS:\n        raise gl.vm.UserError(ERROR_LLM + " the judge answered outside the set: " + answer[:40])\n', ''),
    ("a disagreement between the framings is forgiven", '    if breaks_answer == "yes" and keeps_answer == "no":\n        return "breaks"', '    if breaks_answer == "yes":\n        return "breaks"'),
    ("the round's result is not checked to be an object", '        if not isinstance(settled, dict):\n            raise gl.vm.UserError(ERROR_LLM + " the round returned no verdict")\n', ''),
    ("the round's verdict is not checked against the set", '        if verdict not in VERDICTS:\n            raise gl.vm.UserError(ERROR_LLM + " the round returned no verdict")\n', ''),
    ("the leader's framing answers reach the receipt unchecked", '        if a not in ANSWERS or b not in ANSWERS or _combine(a, b) != verdict:\n            a = b = ""\n', ''),
    # --- the consensus closures
    ("the validator agrees with anything", '            return str(theirs.get("verdict", "")) == mine["verdict"]', '            return True'),
    ("the validator's comparison is always true", '            return str(theirs.get("verdict", "")) == mine["verdict"]', '            return str(theirs.get("verdict", "")) == mine["verdict"] or True'),
    ("the validator copies the leader instead of running itself", '                mine = leader_fn()', '                mine = {"verdict": theirs.get("verdict", "")}'),
    ("the validator also compares the framing answers", '            return str(theirs.get("verdict", "")) == mine["verdict"]',
     '            return str(theirs.get("verdict", "")) == mine["verdict"] and theirs.get("a") == mine["a"]'),
    ("the validator does not wrap its own run", '            try:\n                mine = leader_fn()\n            except Exception:\n                return False\n', '            mine = leader_fn()\n'),
    ("a leader whose round raised is agreed with", '                # retried with another leader. A failure is not a verdict.\n                return False', '                # retried with another leader. A failure is not a verdict.\n                return True'),
    # --- listing
    ("an uppercase hash is accepted", 'all(ch in HASH_CHARS for ch in raw)', 'all(ch.lower() in HASH_CHARS for ch in raw)'),
    ("any number of promises is accepted", 'len(raw) < MIN_PROMISES or len(raw) > MAX_PROMISES', 'len(raw) < MIN_PROMISES'),
    ("a price below the floor is accepted", '        elif price < MIN_PRICE or price > MAX_PRICE:', '        elif price < 0 or price > MAX_PRICE:'),
    ("a window outside the range is accepted", '        elif window < MIN_WINDOW or window > MAX_WINDOW:', '        elif window < 0:'),
    ("a non-string title raises after taking the stake", 'title = title.strip() if isinstance(title, str) else ""', 'title = title.strip()'),
    ("a non-string kind raises after taking the stake", 'kind = kind.strip().lower() if isinstance(kind, str) else ""', 'kind = kind.strip().lower()'),
    ("a fraction in the promises is built into a float", 'json.loads(promises_json, parse_float=_no_fraction, parse_constant=_no_fraction)', 'json.loads(promises_json)'),
    ("a NaN in the promises is built into a float", 'json.loads(promises_json, parse_float=_no_fraction, parse_constant=_no_fraction)', 'json.loads(promises_json, parse_float=_no_fraction)'),
    ("a fraction in the hashes is built into a float", 'json.loads(hashes_json, parse_float=_no_fraction, parse_constant=_no_fraction)', 'json.loads(hashes_json)'),
    ("anyone may close a listing", '        if gl.message.sender_address != listing.seller:\n            _fail("only the seller closes a listing")\n', ''),
    # --- buying
    ("a closed listing still sells", '        elif not listing.open:\n            problem = "this listing is closed"\n', ''),
    ("the seller may buy their own pack", '        elif sender == listing.seller:\n            problem = "a seller does not buy their own pack"\n', ''),
    ("any value buys", '        elif int(value) != int(listing.price):', '        elif False:'),
    ("a purchase with no readable clock is accepted", '            problem = "send exactly the price: " + str(int(listing.price)) + " atto"\n        elif now_seconds < 0:\n            problem = "the network clock could not be read; try again"\n', '            problem = "send exactly the price: " + str(int(listing.price)) + " atto"\n'),
    ("a refused buy keeps the money", '            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned", "returned": str(int(value))})\n        deadline = now_seconds', '            return json.dumps({"ok": False, "reason": problem + "; your funds were returned", "returned": str(int(value))})\n        deadline = now_seconds'),
    ("a refused buy does not say what came back", '"; your funds were returned", "returned": str(int(value))})\n        deadline = now_seconds', '"; your funds were returned"})\n        deadline = now_seconds'),
    ("a non-string listing id raises after taking the price", 'listing_id = listing_id.strip() if isinstance(listing_id, str) else ""', 'listing_id = listing_id.strip()'),
    # --- dispute
    ("a stranger may dispute", '        elif sender != order.buyer:\n            problem = "only the buyer of this order may dispute it"\n', ''),
    ("a non-string order id raises after taking the bond", 'order_id = order_id.strip() if isinstance(order_id, str) else ""', 'order_id = order_id.strip()'),
    ("a dispute after the deadline is accepted", '        elif now_seconds >= int(order.deadline_seconds):\n            problem = "the dispute window closed at " + str(order.deadline_at)\n', ''),
    ("a dispute on a settled order is accepted", '        elif order.status != STATUS_PAID:\n            problem = "only a paid order can be disputed; this one is " + str(order.status)\n', ''),
    ("a section index out of range is accepted", '        elif section < 0 or section >= self._section_count(str(order.listing)):', '        elif section < 0:'),
    ("no bond is required", '        elif int(value) != _bond_for_price(int(order.price)):', '        elif False:'),
    ("a refused dispute keeps the bond", '            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        order.status = STATUS_DISPUTED', '            return json.dumps({"ok": False, "reason": problem + "; your funds were returned"})\n        order.status = STATUS_DISPUTED'),
    # --- judge
    ("judge runs on any status", '        if order.status != STATUS_DISPUTED:\n            if order.verdict:', '        if False:\n            if order.verdict:'),
    ("judge accepts a text with the wrong hash", '            _fail("the text does not match the hash the seller committed for section " + str(section + 1))\n        digest = ', '            pass\n        digest = '),
    ("an oversize committed section is asked of the model", '        oversize = len(section_text) > MAX_SECTION_CHARS', '        oversize = False'),
    ("an oversize committed section pays the seller", '            verdict, first, second = "breaks", "", ""', '            verdict, first, second = "keeps", "", ""'),
    ("an oversize committed section is refused instead of settled", '        promise = int(order.promise_index)\n        if _sha256(section_text)',
     '        promise = int(order.promise_index)\n        if len(section_text) > MAX_SECTION_CHARS:\n            _fail("a section is at most " + str(MAX_SECTION_CHARS) + " characters")\n        if _sha256(section_text)'),
    ("the same digest is judged twice", '        if digest in self.judged_digests:\n            _fail("this section and promise were already judged for this order")\n', ''),
    ("breaks pays the seller", '            to_buyer, to_seller = price + bond + from_stake, 0', '            to_buyer, to_seller = 0, price + bond + from_stake'),
    ("keeps pays the buyer", '            to_buyer, to_seller = 0, price + bond\n            listing.kept', '            to_buyer, to_seller = price + bond, 0\n            listing.kept'),
    ("unclear keeps the bond", '            to_buyer, to_seller = bond, price', '            to_buyer, to_seller = 0, price + bond'),
    # --- withdrawing a dispute
    ("a stranger may withdraw a dispute", '        if gl.message.sender_address != order.buyer:\n            _fail("only the buyer of this order may withdraw its dispute")\n', ''),
    ("a settled order may be withdrawn", '        if order.status != STATUS_DISPUTED:\n            _fail("only a disputed order can be withdrawn; this one is " + str(order.status))\n', ''),
    ("a withdrawn dispute keeps the bond", '        bond = int(order.bond)\n        if bond > 0:\n            _Payee(order.buyer).emit_transfer(value=u256(bond))\n', '        bond = int(order.bond)\n'),
    ("a withdrawn dispute is left disputed", '        order.disputed_at = ""\n        order.status = STATUS_PAID\n', '        order.disputed_at = ""\n'),
    # --- release, missing, stale
    ("release before the deadline", '        if now_seconds < int(order.deadline_seconds):\n            _fail("the dispute window is open until " + str(order.deadline_at))\n', ''),
    ("release of a disputed or missing order", '        if order.status != STATUS_PAID:\n            _fail("only a paid order is released; this one is " + str(order.status))\n', ''),
    ("release with no readable clock", '        if now_seconds < 0:\n            _fail("the network clock could not be read; try again")\n        if now_seconds < int(order.deadline_seconds):', '        if now_seconds < int(order.deadline_seconds):'),
    ("a stranger may report a section missing", '        if gl.message.sender_address != order.buyer:\n            _fail("only the buyer of this order may report a section missing")\n', ''),
    ("a missing report after the deadline", '        if now_seconds >= int(order.deadline_seconds):\n            _fail("the dispute window closed at " + str(order.deadline_at))\n        section = _digits(section_index)', '        section = _digits(section_index)'),
    ("the missing reports are not capped", '        if int(order.missing_reports) >= MAX_MISSING_REPORTS:\n            _fail("a buyer reports at most " + str(MAX_MISSING_REPORTS) + " sections missing per order; "\n                  "a pack that did not arrive ends in a refund")\n', ''),
    ("the missing reports are not counted", '        order.missing_reports = u32(int(order.missing_reports) + 1)\n', ''),
    ("a revealed section can be reported missing again", '        if int(order.revealed_mask) & (1 << section):\n            _fail("section " + str(section + 1) + " is already on chain; read it from the order")\n', ''),
    ("the report marks the section revealed, not the reveal", [
        ('        order.revealed_mask = u32(int(order.revealed_mask) | (1 << section))\n        self.reveals', '        self.reveals'),
        ('        order.missing_index = u32(section)\n', '        order.missing_index = u32(section)\n        order.revealed_mask = u32(int(order.revealed_mask) | (1 << section))\n')]),
    ("a revealed text is not kept per section", '        self.reveals[order_id + ":" + str(section)] = section_text\n', ''),
    ("a report wipes what the seller already revealed", '        order.missing_at = now\n', '        order.missing_at = now\n        order.revealed_text = ""\n'),
    ("a stranger may reveal", '        if gl.message.sender_address != order.seller:\n            _fail("only the seller reveals a section")\n', ''),
    ("reveal accepts a text with the wrong hash", '            _fail("the text does not match the hash the seller committed for section " + str(section + 1))\n        extended = ', '            pass\n        extended = '),
    ("a committed section over the cap may be put on chain", '        if len(section_text) > MAX_SECTION_CHARS:\n            _fail("a section is at most " + str(MAX_SECTION_CHARS) + " characters")\n', ''),
    ("reveal after the 24 hours", '        if now_seconds >= since + REVEAL_HOURS * 3600:\n            _fail("the " + str(REVEAL_HOURS) + " hours to reveal have passed; the buyer may take a refund")\n', ''),
    ("reveal never extends the deadline", '        if extended > int(order.deadline_seconds):', '        if False:'),
    ("refund_missing before the 24 hours", '        if now_seconds < since + REVEAL_HOURS * 3600:\n            _fail("the seller has " + str(REVEAL_HOURS) + " hours from the report to reveal the section")\n', ''),
    ("refund_missing on any status", '        if order.status != STATUS_MISSING:\n            _fail("nothing to refund: the order is " + str(order.status))\n', ''),
    ("settle_stale before the 24 hours", '        if now_seconds < since + STALE_HOURS * 3600:\n            _fail("a dispute may be settled by rule " + str(STALE_HOURS) + " hours after it was opened; judge it instead")\n', ''),
    ("settle_stale pays the bond to the seller", '        to_buyer, to_seller = int(order.bond), int(order.price)', '        to_buyer, to_seller = 0, int(order.bond) + int(order.price)'),
    ("settle_stale on any status", '        if order.status != STATUS_DISPUTED:\n            _fail("nothing stale to settle: the order is " + str(order.status))\n', ''),
    ("a judged order is settled by rule as well", '        if order.verdict:\n            _fail("this order has a verdict; it is not stale")\n', ''),
    # --- the seller's stake: listing
    ("a stake below one slice is accepted", '        elif int(value) < slice_:', '        elif False:'),
    ("the slice is not half the price", '    return price * STAKE_SLICE_PERCENT // 100', '    return price * STAKE_SLICE_PERCENT // 200'),
    ("a refused listing keeps the stake", '            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned", "returned": str(int(value))})\n        stake = int(value)',
     '            return json.dumps({"ok": False, "reason": problem + "; your funds were returned", "returned": str(int(value))})\n        stake = int(value)'),
    ("a refused listing raises after taking the stake", '        if problem:\n            if value > u256(0):\n                _Payee(sender).emit_transfer(value=value)\n            return json.dumps({"ok": False, "reason": problem + "; your funds were returned", "returned": str(int(value))})\n        stake = int(value)',
     '        if problem:\n            _fail(problem)\n        stake = int(value)'),
    ("a listing's capacity ignores its stake", '        return int(listing.stake) // slice_ if slice_ > 0 else 0', '        return 1000'),
    ("a seller is counted once per listing", '            self.seller_count = u32(int(self.seller_count) + 1)\n        record = self.sellers[key]', '        self.seller_count = u32(int(self.seller_count) + 1)\n        record = self.sellers[key]'),
    ("a seller's record starts over with every listing", '        if key not in self.sellers:\n            self.sellers[key] = SellerRecord(', '        if True:\n            self.sellers[key] = SellerRecord('),
    ("a seller's first listing date moves with every listing", '        if not record.first_listed:\n            record.first_listed = now\n', '        record.first_listed = now\n'),
    ("a listing is not counted on the seller's record", '        record.listed = u32(int(record.listed) + 1)\n', ''),
    ("a new stake is not counted on the seller's record", '        record.staked = u256(int(record.staked) + stake)\n', ''),
    ("a listing is not indexed under its seller", '        self._index(self.listings_by_seller, key, listing_id)\n', ''),
    ("the stake held total misses a new listing", '        self.stake_held_total = u256(int(self.stake_held_total) + stake)\n', ''),
    ("a seller's record is keyed by the address as written", '        key = _hex(sender).lower()\n        if key not in self.sellers:', '        key = _hex(sender)\n        if key not in self.sellers:'),
    # --- the seller's stake: capacity
    ("a listing whose stake is all taken still sells", '        elif int(listing.open_orders) >= capacity:', '        elif False:'),
    ("a listing sells one order past its capacity", '        elif int(listing.open_orders) >= capacity:', '        elif int(listing.open_orders) > capacity:'),
    ("a purchase does not hold a slice", '        listing.open_orders = u32(int(listing.open_orders) + 1)\n', ''),
    ("a sale is not counted on the seller's record", '        record.sold = u32(int(record.sold) + 1)\n', ''),
    ("an order that ends keeps holding its slice", '        listing.open_orders = u32(int(listing.open_orders) - 1)\n', ''),
    ("the slice paid is not recorded on the order", '        order.paid_from_stake = u256(from_stake)\n', ''),
    # --- the seller's stake: the slash
    ("a broken promise costs the seller no stake", '            from_stake = self._slash(order)\n            to_buyer, to_seller = price + bond + from_stake, 0', '            to_buyer, to_seller = price + bond + from_stake, 0'),
    ("the slice is taken but never paid to the buyer", '            to_buyer, to_seller = price + bond + from_stake, 0', '            to_buyer, to_seller = price + bond, 0'),
    ("a keeps verdict slashes the seller too", '            to_buyer, to_seller = 0, price + bond\n            listing.kept', '            from_stake = self._slash(order)\n            to_buyer, to_seller = from_stake, price + bond\n            listing.kept'),
    ("an unclear verdict slashes the seller too", '            to_buyer, to_seller = bond, price\n', '            from_stake = self._slash(order)\n            to_buyer, to_seller = bond + from_stake, price\n'),
    ("a stale dispute slashes the seller", '        to_buyer, to_seller = int(order.bond), int(order.price)\n        self._pay(order, to_buyer, to_seller, STATUS_SETTLED_STALE)',
     '        from_stake = self._slash(order)\n        to_buyer, to_seller = int(order.bond) + from_stake, int(order.price)\n        self._pay(order, to_buyer, to_seller, STATUS_SETTLED_STALE, False, from_stake)'),
    ("a release slashes the seller", '        to_seller = int(order.price)\n        self._pay(order, 0, to_seller, STATUS_RELEASED)',
     '        from_stake = self._slash(order)\n        to_seller = int(order.price)\n        self._pay(order, from_stake, to_seller, STATUS_RELEASED, False, from_stake)'),
    ("a section never revealed costs the seller no stake", '        from_stake = self._slash(order)\n        to_buyer = int(order.price) + from_stake', '        from_stake = 0\n        to_buyer = int(order.price) + from_stake'),
    ("a refund takes the slice but never pays it", '        to_buyer = int(order.price) + from_stake', '        to_buyer = int(order.price)'),
    ("a slash takes the whole stake", '        taken = slice_ if slice_ < stake else stake', '        taken = stake'),
    ("a slash leaves the stake where it was", '        listing.stake = u256(stake - taken)\n', ''),
    ("a slash is not counted as paid by the listing", '        listing.stake_paid = u256(int(listing.stake_paid) + taken)\n', ''),
    ("a slash is not taken off the seller's record", '        record.staked = u256(int(record.staked) - taken)\n', ''),
    ("a slash is not added to what the seller's stakes paid", '        record.stake_paid = u256(int(record.stake_paid) + taken)\n', ''),
    ("the stake held total misses a slash", '        self.stake_held_total = u256(int(self.stake_held_total) - taken)\n', ''),
    ("the stake paid total misses a slash", '        self.stake_paid_total = u256(int(self.stake_paid_total) + taken)\n', ''),
    ("a listing short of a slice stays open", '        if int(listing.stake) < slice_ and listing.open:\n            listing.open = False\n            listing.closed_reason = CLOSED_OUT_OF_STAKE\n', ''),
    ("a listing with exactly one slice left closes itself", '        if int(listing.stake) < slice_ and listing.open:', '        if int(listing.stake) <= slice_ and listing.open:'),
    ("a slash overwrites the reason the seller closed for", '        if int(listing.stake) < slice_ and listing.open:', '        if int(listing.stake) < slice_:'),
    # --- the seller's stake: close and withdraw
    ("closing returns the stake while orders are open", '        if int(listing.open_orders) == 0:\n            returned = self._return_stake(listing)', '        if True:\n            returned = self._return_stake(listing)'),
    ("closing never returns the stake", '        if int(listing.open_orders) == 0:\n            returned = self._return_stake(listing)', '        if False:\n            returned = self._return_stake(listing)'),
    ("a listing the seller closed gives no reason", '        listing.closed_reason = CLOSED_BY_SELLER\n', ''),
    ("anyone may withdraw a stake", '        if gl.message.sender_address != listing.seller:\n            _fail("only the seller withdraws a listing\'s stake")\n', ''),
    ("a stake is withdrawn from an open listing", '        if listing.open:\n            _fail("close the listing first: an open listing\'s stake backs the orders it may still take")\n', ''),
    ("a stake is withdrawn while it backs open orders", '        if int(listing.open_orders) > 0:\n            _fail(', '        if False:\n            _fail('),
    ("an empty stake is withdrawn again", '        if int(listing.stake) == 0:\n            _fail("this listing has no stake left to withdraw")\n', ''),
    ("a returned stake is never zeroed", '        listing.stake = u256(0)\n', ''),
    ("a returned stake stays on the seller's record", '        record.staked = u256(int(record.staked) - amount)\n', ''),
    ("the stake held total misses a returned stake", '        self.stake_held_total = u256(int(self.stake_held_total) - amount)\n', ''),
    # --- the seller's record
    ("a keeps verdict is not on the seller's record", '            record.kept = u32(int(record.kept) + 1)\n', ''),
    ("a breaks verdict is not on the seller's record", '            record.broken = u32(int(record.broken) + 1)\n', ''),
    ("an unclear verdict is not on the seller's record", '            record.unclear = u32(int(record.unclear) + 1)\n', ''),
    ("a release is not on the seller's record", '        record.released = u32(int(record.released) + 1)\n', ''),
    ("a refund is not on the seller's record", '        record.refunded = u32(int(record.refunded) + 1)\n', ''),
    ("a stale settlement is not on the seller's record", '        record.stale = u32(int(record.stale) + 1)\n', ''),
    ("the seller view calls an unknown address known", 'return json.dumps({"seller": key, "known": False,', 'return json.dumps({"seller": key, "known": True,'),
    ("the seller view is case sensitive", '        key = address_hex.strip()[:MAX_ARG_CHARS].lower()\n        if key not in self.sellers:', '        key = address_hex.strip()[:MAX_ARG_CHARS]\n        if key not in self.sellers:'),
    ("the listing row says every slice is free", '"free": free if free > 0 else 0', '"free": capacity'),
    ("the stats leave out what stakes have paid", '"stake_paid": str(int(self.stake_paid_total))', '"stake_paid": "0"'),
    ("the sentence leaves out the slice of a broken promise", '    if from_stake > 0:\n        got_back = ', '    if False:\n        got_back = '),
    ("the refund sentence leaves out the slice", '(" plus one slice of the seller\'s stake" if from_stake > 0 else "")', '""'),
    ("the sentence is never told the slice", '                                           int(order.missing_index) + 1, to_buyer, to_seller, oversize, from_stake)', '                                           int(order.missing_index) + 1, to_buyer, to_seller, oversize, 0)'),
    # --- the contract's own sentence, and the batch view
    ("no sentence is written when an order ends", '        order.verdict_line = _verdict_line(status, str(order.verdict), int(order.section_index) + 1, int(order.promise_index) + 1,\n                                           int(order.missing_index) + 1, to_buyer, to_seller, oversize, from_stake)\n', ''),
    ("the sentence counts sections and promises from zero", '_verdict_line(status, str(order.verdict), int(order.section_index) + 1, int(order.promise_index) + 1,', '_verdict_line(status, str(order.verdict), int(order.section_index), int(order.promise_index),'),
    ("the sentence reports the amounts the other way round", '                                           int(order.missing_index) + 1, to_buyer, to_seller, oversize, from_stake)', '                                           int(order.missing_index) + 1, to_seller, to_buyer, oversize, from_stake)'),
    ("the ledger view is not bounded", 'MAX_LEDGER_ROWS = 50', 'MAX_LEDGER_ROWS = 5000'),
    ("the order view calls the window open after the deadline",
     '        row["window_open"] = str(o.status) == STATUS_PAID and (now_seconds < 0 or now_seconds < int(o.deadline_seconds))',
     '        row["window_open"] = str(o.status) == STATUS_PAID'),
    ("the listings page ignores its offset", '        i = offset\n        while i < total and len(rows) < limit:', '        i = 0\n        while i < total and len(rows) < limit:'),
    ("the listings page is not capped", '        if limit < 0 or limit > MAX_LISTING_PAGE:', '        if limit < 0:'),
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
        for name, *rest in MUTATIONS:
            edits = rest[0] if len(rest) == 1 else [(rest[0], rest[1])]
            text = SRC
            for old, new in edits:
                if SRC.count(old) != 1:
                    print(f"  ! anchor not found exactly once ({SRC.count(old)}): {name}"); return 2
                text = text.replace(old, new)
            path = pathlib.Path(tmp) / f"as_described_{len(rows) + len(escaped)}.py"; path.write_text(text, encoding="utf-8")
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
