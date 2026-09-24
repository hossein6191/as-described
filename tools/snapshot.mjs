/* Retake data/snapshot.json from a register.
 *
 *   node tools/snapshot.mjs                 # the register in lib/config.ts
 *   node tools/snapshot.mjs 0x…             # another register
 *
 * The file is the labelled fallback the site shows when Studio answers nothing at all (see
 * lib/chain.ts): it is used only for the register it was read from, and every page that shows it
 * says so. Reads only, no wallet, no transaction. Studio allows 30 gen_call a minute, so this
 * paces itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "data", "snapshot.json");

const register =
  process.argv[2] ||
  (readFileSync(path.join(REPO, "lib", "config.ts"), "utf8").match(/DEMO_CONTRACT = "(0x[0-9a-fA-F]{40})"/) || [])[1];
if (!register) {
  console.error("no register: pass one as the first argument");
  process.exit(1);
}

const client = createClient({ chain: studionet });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

async function view(fn, args = []) {
  for (let i = 0; ; i++) {
    try {
      return parse(await client.readContract({ address: register, functionName: fn, args }));
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}

const str = (v, d = "") => (v === undefined || v === null ? d : String(v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const atto = (v) => (/^\d+$/.test(str(v, "0").trim()) ? str(v).trim() : "0");
const addr = (v) => str(v).toLowerCase();
const listOf = (v) => (Array.isArray(v) ? v.map(String) : []);

const asListing = (row) => ({
  id: str(row.listing ?? row.id),
  seller: addr(row.seller),
  title: str(row.title),
  kind: str(row.kind, "other"),
  promises: listOf(row.promises),
  hashes: listOf(row.hashes),
  sectionCount: num(row.section_count, listOf(row.hashes).length),
  priceAtto: atto(row.price),
  windowSeconds: num(row.window_seconds),
  createdAt: str(row.created_at),
  open: row.open === true,
  orders: num(row.orders),
  kept: num(row.kept),
  broken: num(row.broken),
  unclear: num(row.unclear),
});

const asOrder = (row) => {
  const status = str(row.status);
  const disputed = str(row.disputed_at) !== "" || ["disputed", "settled", "settled_stale"].includes(status);
  const missingAt = str(row.missing_at);
  return {
    id: str(row.order ?? row.id),
    listing: str(row.listing),
    title: str(row.title),
    buyer: addr(row.buyer),
    seller: addr(row.seller),
    priceAtto: atto(row.price),
    openedAt: str(row.opened_at),
    deadlineAt: str(row.deadline_at),
    status,
    sectionIndex: disputed ? num(row.section_index, -1) : -1,
    promiseIndex: disputed ? num(row.promise_index, -1) : -1,
    bondAtto: atto(row.bond),
    disputedAt: str(row.disputed_at),
    verdict: str(row.verdict),
    judgedAt: str(row.judged_at),
    revealedText: str(row.revealed_text),
    missingIndex: missingAt ? num(row.missing_index, -1) : -1,
    missingAt,
    missingReportsLeft: "missing_reports_left" in row ? num(row.missing_reports_left, 0) : null,
    paidBuyer: atto(row.paid_buyer),
    paidSeller: atto(row.paid_seller),
    windowOpen: row.window_open === true,
    bondRequiredAtto: atto(row.bond_required),
    revealed: Array.isArray(row.revealed)
      ? row.revealed.map((r) => ({ index: num(r.index, 0), text: str(r.text) }))
      : [],
    verdictLine: str(row.verdict_line),
    chainNow: "",
    readAtMs: 0,
  };
};

const ledgerRow = (o) => ({
  id: o.id,
  listing: o.listing,
  title: o.title,
  buyer: o.buyer,
  seller: o.seller,
  priceAtto: o.priceAtto,
  status: o.status,
  verdict: o.verdict,
  sectionIndex: o.sectionIndex,
  promiseIndex: o.promiseIndex,
  judgedAt: o.judgedAt,
  paidBuyer: o.paidBuyer,
  paidSeller: o.paidSeller,
  openedAt: o.openedAt,
});

const stats = await view("stats");
const ids = await view("listing_ids");
const listings = {};
const bonds = {};
for (const id of ids) {
  const row = await view("listing", [id]);
  listings[id] = asListing(row);
  bonds[id] = atto(row.bond);
  await sleep(2500);
}
const ledgerRaw = await view("ledger", ["50"]);
const orders = {};
const ledger = [];
for (const row of ledgerRaw) {
  const id = str(row.order);
  const full = await view("order", [id]);
  const o = asOrder(full);
  // "now" and the moment of the read are live facts; a snapshot must not pretend to carry them.
  orders[id] = o;
  ledger.push(ledgerRow(o));
  await sleep(2500);
}

const snapshot = {
  takenAt: new Date().toISOString(),
  network: "GenLayer Studio, chain 61999",
  register,
  note: "A read-only copy of the register above, shown only when Studio answers nothing and only for that register. Every page that falls back to it says so.",
  listingIds: ids,
  listings,
  orders,
  ledger,
  stats: {
    listings: num(stats.listings),
    orders: num(stats.orders),
    kept: num(stats.kept),
    broken: num(stats.broken),
    unclear: num(stats.unclear),
    refunded: num(stats.refunded),
    released: num(stats.released),
    stale: num(stats.stale),
  },
  bonds,
};

writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`${OUT}: ${ids.length} listings, ${ledger.length} orders, register ${register}`);
