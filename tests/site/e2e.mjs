/* End-to-end run of the As Described site against GenLayer Studio, with two throwaway
 * wallets played by tests/site/fake-wallet.js inside headless Chrome.
 *
 *   node tests/site/e2e.mjs                       # everything: starts `next dev -p 3120`, runs steps a–g
 *   STEPS=a,e,f node tests/site/e2e.mjs           # a subset (ids from the last run are reused from state.json)
 *   STEPS=d2 node tests/site/e2e.mjs              # d splits into d1 (/pack/L2) and d2 (the breaks path on a fresh pack)
 *   FRESH=1 node tests/site/e2e.mjs               # new keys (the default reuses funded keys from state.json)
 *   HEADFUL=1 node tests/site/e2e.mjs             # watch the browser
 *
 * Every chain step is observed on the page (the TxRail text, the verdict card, the balance),
 * never inferred. Screenshots, the dev-server log, the Chrome profile and report.json go
 * under the scratch directory below. The dev server and Chrome are killed at the end.
 */
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRATCH = process.env.E2E_SCRATCH || path.join(os.tmpdir(), "as-described-e2e");
const SHOTS = path.join(SCRATCH, "shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.PORT || 3120);
const BASE = `http://localhost:${PORT}`;
const CONTRACT = process.env.CONTRACT || "0xA1abE645e6454E7A7128005877923f1A9DC51652";
const RPC = "https://studio.genlayer.com/api";
const RAIL_TIMEOUT = 240_000;
const READ_TIMEOUT = 90_000;
const STEPS = (process.env.STEPS || "a,b,c,d,e,f,g").split(",").map((s) => s.trim());
const on = (s) => STEPS.includes(s);

mkdirSync(SHOTS, { recursive: true });
const STATE_FILE = path.join(SCRATCH, "state.json");
const state = existsSync(STATE_FILE) && !process.env.FRESH ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ---------- reporting ----------
const results = []; // { step, result, note }
const consoleErrors = []; // { step, page, type, text }
const netFailures = []; // { step, page, status, method, url }
const notes = []; // free observations
let currentStep = "setup";
let shotNo = 0;
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(7) + "s";
const log = (...a) => {
  const line = `[${stamp()}] ${a.join(" ")}`;
  console.log(line);
  appendFileSync(path.join(SCRATCH, "e2e.log"), line + "\n");
};
const record = (step, result, note) => {
  results.push({ step, result, note });
  log(`${result}  ${step}  — ${note}`);
};
const observe = (text) => {
  notes.push(`[${currentStep}] ${text}`);
  log("note:", text);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (a) => (a ? a.toLowerCase().slice(0, 6) + "…" + a.toLowerCase().slice(-4) : ""); // the site prints addresses lowercase
const fmtGen = (atto) => (Number(atto) / 1e18).toFixed(3) + " GEN";

// ---------- Studio JSON-RPC ----------
let rpcId = 1;
async function rpc(method, params = [], tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }) });
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    } catch (e) {
      last = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}
const balance = async (addr) => BigInt((await rpc("eth_getBalance", [addr, "latest"])) || "0x0");
async function fund(addr) {
  const before = await balance(addr);
  await rpc("sim_fundAccount", { account_address: addr, amount: 200e18 });
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    await sleep(2500);
    const now = await balance(addr);
    if (now !== before) return now;
  }
  throw new Error(`faucet did not credit ${addr} within 90 s`);
}
/** Studio allows 30 requests per minute per client; a step that starts with a spent budget only sees 429s. */
async function quota() {
  try {
    // gen_call sits in Studio's "standard" bucket (30/min); eth_* reads have their own 300/min bucket
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "gen_call", params: [{ to: CONTRACT, from: "0x0000000000000000000000000000000000000000", data: "0x", type: "read", transaction_hash_variant: "latest-final" }] }) });
    await r.text();
    return { status: r.status, remaining: Number(r.headers.get("x-ratelimit-remaining") ?? -1), reset: Number(r.headers.get("x-ratelimit-reset") ?? r.headers.get("retry-after") ?? 0), limit: r.headers.get("x-ratelimit-limit") };
  } catch {
    return { status: 0, remaining: -1, reset: 0, limit: null };
  }
}
async function cooldown(need = 20) {
  const q = await quota();
  if (q.remaining >= 0 && q.remaining < need) {
    const wait = Math.min(75, q.reset + 2);
    log(`rate limit: ${q.remaining}/${q.limit} requests left this minute (HTTP ${q.status}); waiting ${wait} s for the window`);
    await sleep(wait * 1000);
  }
}
async function txInfo(hash) {
  const t = await rpc("eth_getTransactionByHash", [hash], 2).catch(() => null);
  if (!t) return null;
  const votes = t.consensus_data?.votes || {};
  const tally = { agree: 0, disagree: 0, idle: 0 };
  for (const v of Object.values(votes)) tally[v === "agree" ? "agree" : v === "disagree" ? "disagree" : "idle"]++;
  const lr = t.consensus_data?.leader_receipt;
  const one = Array.isArray(lr) ? lr[0] : lr;
  let msg = "";
  try {
    msg = Buffer.from(one?.result || "", "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim();
  } catch {}
  return { status: t.status, tally, exec: one?.execution_result, msg: msg.slice(0, 300) };
}

// ---------- dev server ----------
let dev = null;
let devLogFd = null;
async function httpOk(url) {
  try {
    const r = await fetch(url, { redirect: "manual" });
    return r.status;
  } catch {
    return 0;
  }
}
async function startDev() {
  if ((await httpOk(BASE + "/")) === 200) {
    observe(`a server already answers on ${BASE}; reusing it (it is not killed at the end)`);
    return;
  }
  devLogFd = openSync(path.join(SCRATCH, "dev.log"), "w");
  const cmd = `find .next -name '._*' -delete 2>/dev/null; NEXT_PUBLIC_MOCK=0 NEXT_PUBLIC_CONTRACT=${CONTRACT} PACK_SECRET=e2e-secret ./node_modules/.bin/next dev -p ${PORT}`;
  dev = spawn("sh", ["-c", cmd], { cwd: REPO, detached: true, stdio: ["ignore", devLogFd, devLogFd] });
  log(`dev server pid ${dev.pid}: ${cmd}`);
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const s = await httpOk(BASE + "/");
    if (s === 200) {
      log(`dev server up after ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return;
    }
    if (dev.exitCode !== null) throw new Error(`next dev exited with ${dev.exitCode}; see ${path.join(SCRATCH, "dev.log")}`);
    await sleep(1500);
  }
  throw new Error("dev server did not answer 200 within 180 s");
}
function stopDev() {
  if (!dev) return;
  try {
    process.kill(-dev.pid, "SIGTERM");
  } catch {}
  setTimeout(() => {
    try {
      process.kill(-dev.pid, "SIGKILL");
    } catch {}
  }, 4000).unref();
  try {
    // anything still holding the port (next dev forks a worker)
    const pids = execSync(`lsof -t -i :${PORT} -sTCP:LISTEN 2>/dev/null || true`, { encoding: "utf8" }).trim();
    for (const p of pids.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(p), "SIGKILL");
      } catch {}
    }
  } catch {}
  if (devLogFd !== null) closeSync(devLogFd);
  log("dev server stopped");
}

// ---------- browser ----------
const WALLET_SRC = readFileSync(path.join(REPO, "tests", "site", "fake-wallet.js"), "utf8");
let browser = null;
async function launch() {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : true,
    userDataDir: path.join(SCRATCH, `chrome-profile-${Date.now()}`),
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-first-run", "--no-default-browser-check", "--disable-features=Translate,MediaRouter", "--window-size=1280,900"],
  });
}
function wire(page, label) {
  page.on("console", (m) => {
    const type = m.type();
    if (type === "error" || type === "warning") {
      const text = m.text().replace(/\s+/g, " ").slice(0, 400);
      consoleErrors.push({ step: currentStep, page: page.url(), type, text });
      log(`console.${type} [${label}] ${text.slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => {
    consoleErrors.push({ step: currentStep, page: page.url(), type: "pageerror", text: String(e && e.message ? e.message : e).slice(0, 400) });
    log(`pageerror [${label}] ${String(e).slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      netFailures.push({ step: currentStep, page: page.url(), status: r.status(), method: r.request().method(), url: r.url() });
      log(`http ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    }
  });
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText || "";
    if (f.includes("ERR_ABORTED")) return;
    netFailures.push({ step: currentStep, page: page.url(), status: 0, method: r.method(), url: r.url(), error: f });
    log(`request failed ${r.method()} ${r.url().slice(0, 160)} ${f}`);
  });
}
async function newPage({ wallet = true, context = null } = {}) {
  const page = await (context || browser).newPage();
  if (wallet) {
    await page.evaluateOnNewDocument(`window.__FAKE_KEYS = ${JSON.stringify(state.keys)};`);
    await page.evaluateOnNewDocument(WALLET_SRC);
  }
  wire(page, wallet ? "wallet" : "visitor");
  page.setDefaultTimeout(READ_TIMEOUT);
  return page;
}
async function shot(page, name) {
  shotNo += 1;
  const file = path.join(SHOTS, `${String(shotNo).padStart(2, "0")}-${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
  } catch (e) {
    log("screenshot failed", String(e).slice(0, 100));
  }
  return file;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, needle, timeout = READ_TIMEOUT) {
  const re = needle instanceof RegExp;
  await page.waitForFunction(
    (n, isRe) => {
      const t = document.body.innerText;
      return isRe ? new RegExp(n.source, n.flags).test(t) : t.includes(n);
    },
    { timeout, polling: 500 },
    re ? { source: needle.source, flags: needle.flags } : needle,
    re,
  );
}
async function waitGone(page, needle, timeout = 10_000) {
  await page.waitForFunction((n) => !document.body.innerText.includes(n), { timeout, polling: 300 }, needle);
}
/** The first visible element of `tag` whose text contains `text`; scrolls it into view. */
async function findByText(page, tag, text, { exact = false, within = null } = {}) {
  const handle = await page.evaluateHandle(
    (tag, text, exact, within) => {
      const root = within ? Array.from(document.querySelectorAll("li, section, div, article")).find((el) => el.innerText && el.innerText.includes(within)) || document : document;
      const els = Array.from(root.querySelectorAll(tag));
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const found = els.find((el) => visible(el) && (exact ? norm(el.innerText) === text : norm(el.innerText).includes(text)));
      if (found) found.scrollIntoView({ block: "center" });
      return found || null;
    },
    tag,
    text,
    exact,
    within,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no visible <${tag}> containing "${text}"${within ? ` inside "${within}"` : ""}`);
  return el;
}
async function click(page, tag, text, opts) {
  const el = await findByText(page, tag, text, opts);
  await el.click();
  return el;
}
/** A section <li> of the order page, found by its "Section N" header. */
async function clickInSection(page, n, buttonText) {
  const handle = await page.evaluateHandle(
    (n, buttonText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const li = Array.from(document.querySelectorAll("ol > li")).find((el) => {
        const head = el.querySelector("span.font-medium");
        return head && norm(head.innerText) === `Section ${n}`;
      });
      if (!li) return null;
      const b = Array.from(li.querySelectorAll("button")).find((x) => norm(x.innerText).includes(buttonText));
      if (b) b.scrollIntoView({ block: "center" });
      return b || null;
    },
    n,
    buttonText,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no "${buttonText}" button in Section ${n}`);
  await el.click();
}
/** Text of every TxRail whose label contains `label` ([data-tx] wrappers). */
const railText = (page, label) =>
  page.evaluate((label) => {
    const rails = Array.from(document.querySelectorAll("[data-tx]")).filter((r) => r.innerText.includes(label));
    return rails.map((r) => ({ hash: r.getAttribute("data-tx"), text: r.innerText.replace(/\s+/g, " ").trim() }));
  }, label);
const FINAL_RE = /Finalized\.|Finalized;|The contract refused|validators split|cancelled this transaction|did not accept/;
/** Waits until the rail with this label reports a final state; returns { hash, text, kind, seconds }. */
async function waitRail(page, label, timeout = RAIL_TIMEOUT, doneWhen = null) {
  const started = Date.now();
  let last = null;
  let stages = [];
  while (Date.now() - started < timeout) {
    // a page that moves on (the pack page routes to the order page on success) ends the wait too
    if (doneWhen && (await doneWhen())) return { ...(last || { hash: null, text: "(the page moved on before the rail printed its final line)" }), kind: "applied", seconds: (Date.now() - started) / 1000, movedOn: true };
    const rails = await railText(page, label);
    if (rails.length) {
      last = rails[0];
      const stage = (last.text.match(/pending|proposing|committing|revealing|accepted|finalized/gi) || []).join(",");
      if (!stages.length || stages[stages.length - 1] !== stage) stages.push(stage);
      if (FINAL_RE.test(last.text)) {
        const kind = /validators split/.test(last.text) ? "split" : /refused|did not accept|cancelled/.test(last.text) ? "refused" : "applied";
        return { ...last, kind, seconds: (Date.now() - started) / 1000 };
      }
    }
    await sleep(2000);
  }
  return { ...(last || { hash: null, text: "(no rail found)" }), kind: "timeout", seconds: (Date.now() - started) / 1000 };
}
const headerText = (page) => page.evaluate(() => (document.querySelector("header")?.innerText || "").replace(/\s+/g, " ").trim());
async function connectHeader(page, name) {
  await page.evaluate((n) => window.__fakeWallet.use(n), name);
  const addr = await page.evaluate((n) => window.__fakeWallet.address(n), name);
  // accountsChanged reaches React a tick later; the silent reconnect after a load a little later still
  const shown = await page
    .waitForFunction((s) => (document.querySelector("header")?.innerText || "").includes(s), { timeout: 6000, polling: 200 }, short(addr))
    .then(() => true)
    .catch(() => false);
  if (shown) return addr;
  const headerBtn = await page.evaluateHandle(() => Array.from(document.querySelectorAll("header button")).find((b) => b.innerText.trim() === "Connect wallet" && (b.offsetWidth || b.offsetHeight)) || null);
  if (!headerBtn.asElement()) throw new Error(`the header shows neither ${short(addr)} nor a Connect wallet button: "${(await headerText(page)).slice(-80)}"`);
  await headerBtn.asElement().click();
  // the picker appears only when the site has a choice to offer
  const picker = await page
    .waitForFunction(() => document.body.innerText.includes("Which wallet?") || document.body.innerText.includes("Connect a different wallet?"), { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (picker) {
    observe("the wallet picker opened; it lists: " + (await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button')).map((b) => b.innerText.replace(/\s+/g, " ").trim()).join(" | "))));
    await click(page, "button", "Fake Wallet");
  }
  await page.waitForFunction((s) => (document.querySelector("header")?.innerText || "").includes(s), { timeout: 30_000 }, short(addr));
  return addr;
}
/** The number shown next to the address in the header, e.g. "199.5 GEN". */
const headerBalance = async (page) => ((await headerText(page)).match(/(-?[\d.]+) GEN/) || [])[1] || null;
const checkStatus = async (id) => {
  const r = await fetch(`${BASE}/api/packs/${id}/status`, { cache: "no-store" });
  return { http: r.status, body: await r.text() };
};

/** Lists one demo pack as the seller through /sell and uploads it. Returns the listing id. */
async function listDemo(page, chipPrefix, expectTitle, expectPrice) {
  await page.goto(`${BASE}/sell`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Load a demo pack", 30_000);
  observe(`/sell before any chip: Kind select shows "${await page.$eval("#kind", (el) => el.innerText.trim())}", Dispute window select shows "${await page.$eval("#window", (el) => el.innerText.trim())}" (its value is 259200 = 3 days)`);
  await click(page, "button", chipPrefix);
  const title = await page.$eval("#title", (el) => el.value);
  const windowText = await page.$eval("#window", (el) => el.innerText.trim());
  const priceText = await page.$eval("#price", (el) => el.value);
  observe(`demo chip "${chipPrefix}" filled title="${title}", price=${priceText} GEN, window="${windowText}"`);
  if (title !== expectTitle) throw new Error(`the chip filled "${title}", expected "${expectTitle}"`);
  await shot(page, "sell-form-filled");
  await click(page, "button", `List for ${expectPrice}`);
  const sent = await page.waitForFunction(() => !!document.querySelector("[data-tx]") || Array.from(document.querySelectorAll("p")).some((p) => /text-breaks/.test(p.className) && p.innerText.trim()), { timeout: 60_000 }).then(() => true).catch(() => false);
  if (!sent) throw new Error("no transaction rail and no error appeared within 60 s of pressing List");
  const early = await page.evaluate(() => Array.from(document.querySelectorAll("p.text-breaks, p[class*='text-breaks']")).map((p) => p.innerText.trim()).filter(Boolean));
  if (early.length && !(await page.$("[data-tx]"))) throw new Error("List refused before sending: " + early.join(" | "));
  const rail = await waitRail(page, "Listing the pack");
  observe(`list_pack rail (${rail.seconds.toFixed(0)} s): ${rail.text}`);
  await shot(page, "sell-listed-rail");
  if (rail.kind !== "applied") throw new Error(`list_pack ended ${rail.kind}: ${rail.text}`);
  await waitText(page, /Listed as L\d+/, 30_000);
  const id = (await bodyText(page)).match(/Listed as (L\d+)/)[1];
  const before = await checkStatus(id);
  observe(`GET /api/packs/${id}/status before the upload signature: ${before.http} ${before.body}`);
  const signsBefore = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  await click(page, "button", "Sign and upload");
  await page.waitForFunction(() => document.body.innerText.includes("Your pack is live.") || Array.from(document.querySelectorAll("p")).some((p) => p.className.includes("text-breaks") && p.innerText.trim()), { timeout: 90_000 });
  const t = await bodyText(page);
  const signsAfter = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  await shot(page, `sell-uploaded-${id}`);
  if (!t.includes("Your pack is live.")) {
    const err = await page.evaluate(() => Array.from(document.querySelectorAll("p")).filter((p) => p.className.includes("text-breaks")).map((p) => p.innerText.trim()).join(" | "));
    throw new Error(`upload of ${id} failed: ${err}`);
  }
  const after = await checkStatus(id);
  observe(`upload of ${id}: ${signsAfter - signsBefore} personal_sign call(s); GET status after: ${after.http} ${after.body}`);
  return { id, txHash: rail.hash, statusAfter: after };
}

/** Buys a pack as the connected buyer; returns { orderId, url, seconds, rail }. */
async function buy(page, listingId, priceLabel) {
  await page.goto(`${BASE}/pack/${listingId}`, { waitUntil: "domcontentloaded" });
  await waitText(page, `Pay ${priceLabel}`, READ_TIMEOUT);
  await shot(page, `pack-${listingId}-before-pay`);
  const started = Date.now();
  await click(page, "button", `Pay ${priceLabel}`);
  const rail = await waitRail(page, "Paying", RAIL_TIMEOUT, () => /\/order\/O\d+/.test(page.url()));
  observe(`buy ${listingId} rail (${rail.seconds.toFixed(0)} s${rail.movedOn ? ", page routed to the order before the final line was read" : ""}): ${rail.text}`);
  if (rail.kind !== "applied") {
    await shot(page, `pack-${listingId}-pay-${rail.kind}`);
    throw new Error(`buy ended ${rail.kind}: ${rail.text}`);
  }
  await page.waitForFunction(() => /\/order\/O\d+/.test(location.pathname), { timeout: 30_000 });
  const url = page.url();
  const orderId = url.match(/\/order\/(O\d+)/)[1];
  await waitText(page, /Order O\d+|Thank you!/, READ_TIMEOUT);
  await shot(page, `order-${orderId}-arrived`);
  return { orderId, url, seconds: (Date.now() - started) / 1000, rail };
}

/** Signs once and loads the pack on the order page; returns { matches, total, signs, text }. */
async function loadPack(page) {
  const signsBefore = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  await page.waitForFunction(() => document.body.innerText.includes("Sign to read the pack") || document.body.innerText.includes("match the committed hashes") || document.body.innerText.includes("Connect a wallet to read your pack"), { timeout: READ_TIMEOUT });
  if ((await bodyText(page)).includes("Sign to read the pack")) await click(page, "button", "Sign to read the pack");
  await page.waitForFunction(() => document.body.innerText.includes("match the committed hashes") || Array.from(document.querySelectorAll("p")).some((p) => p.className.includes("text-breaks") && p.innerText.trim()), { timeout: 60_000 });
  const t = await bodyText(page);
  const signsAfter = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  const m = t.match(/(\d+)\/(\d+) match the committed hashes/);
  const matches = (t.match(/matches hash/g) || []).length;
  const mismatches = (t.match(/does not match the committed hash/g) || []).length;
  const undelivered = (t.match(/not delivered/g) || []).length;
  const err = await page.evaluate(() => Array.from(document.querySelectorAll("p")).filter((p) => p.className.includes("text-breaks")).map((p) => p.innerText.trim()).join(" | "));
  return { counter: m ? `${m[1]}/${m[2]}` : null, matches, mismatches, undelivered, signs: signsAfter - signsBefore, error: err };
}

/** Disputes section `section` against promise `promiseNo` on the open order page, through bond and judge. */
async function dispute(page, orderId, section, promiseNo) {
  const out = { bond: null, judge: null, verdictCard: "", votes: "", status: "", paidSeller: null, paidBuyer: null, retried: false };
  await clickInSection(page, section, "This breaks a promise");
  await waitText(page, "breaks which promise?", 10_000);
  await shot(page, `order-${orderId}-pick-promise`);
  await click(page, "button", `P${promiseNo}`);
  out.bond = await waitRail(page, "Posting the bond");
  observe(`open_dispute rail (${out.bond.seconds.toFixed(0)} s): ${out.bond.text}`);
  await shot(page, `order-${orderId}-bond-${out.bond.kind}`);
  if (out.bond.kind !== "applied") return out;
  const appeared = Date.now();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((b) => /Ask the validators|Try again/.test(b.innerText)), { timeout: 60_000 });
  const firstLook = await page.evaluate(() => ({
    disabled: Array.from(document.querySelectorAll("button")).find((b) => /Ask the validators/.test(b.innerText))?.disabled ?? null,
    pasteBox: !!Array.from(document.querySelectorAll("textarea")).find((t) => /Paste the exact text/.test(t.placeholder || "")),
    status: (document.body.innerText.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "?",
  }));
  const enabled = await page
    .waitForFunction(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => /Ask the validators/.test(x.innerText)); return !!b && !b.disabled; }, { timeout: 90_000, polling: 500 })
    .then(() => true)
    .catch(() => false);
  const nowLook = await page.evaluate(() => ({ status: (document.body.innerText.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "?", pasteBox: !!Array.from(document.querySelectorAll("textarea")).find((t) => /Paste the exact text/.test(t.placeholder || "")) }));
  observe(`after the bond: the button first appeared disabled=${firstLook.disabled} with paste box=${firstLook.pasteBox} (status "${firstLook.status}"); enabled after ${((Date.now() - appeared) / 1000).toFixed(1)} s: ${enabled} (status "${nowLook.status}", paste box=${nowLook.pasteBox})`);
  if (!enabled) throw new Error("the Ask the validators button never enabled within 90 s of the bond finalizing");
  await cooldown(25);
  await click(page, "button", "Ask the validators");
  out.judge = await waitRail(page, "Validators are reading the section");
  observe(`judge rail (${out.judge.seconds.toFixed(0)} s): ${out.judge.text}`);
  if (out.judge.kind === "split" || out.judge.kind === "timeout") {
    out.retried = true;
    observe(`judge ended ${out.judge.kind}; retrying once through the page's Try again / Ask the validators button`);
    await shot(page, `order-${orderId}-judge-${out.judge.kind}`);
    const btn = await findByText(page, "button", "Try again").catch(() => findByText(page, "button", "Ask the validators"));
    await btn.click();
    out.judge = await waitRail(page, "Validators are reading the section");
    observe(`judge retry rail (${out.judge.seconds.toFixed(0)} s): ${out.judge.text}`);
  }
  out.votes = (out.judge.text.match(/\d+ agree · \d+ disagree · \d+ idle/) || [""])[0];
  await shot(page, `order-${orderId}-judge-${out.judge.kind}`);
  if (out.judge.kind !== "applied") return out;
  await page.waitForFunction(() => document.body.innerText.includes("Verdict:"), { timeout: 60_000 }).catch(() => {});
  const t = await bodyText(page);
  out.verdictCard = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("section")).find((x) => x.innerText.includes("Verdict:"));
    return s ? s.innerText.replace(/\s+/g, " ").trim() : "";
  });
  out.status = (t.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "";
  out.paidSeller = (t.match(/Paid to seller\s*\n\s*([^\n]+)/) || [])[1] || null;
  out.paidBuyer = (t.match(/Paid to buyer\s*\n\s*([^\n]+)/) || [])[1] || null;
  await shot(page, `order-${orderId}-verdict`);
  return out;
}

// ---------- the run ----------
process.on("SIGINT", () => {
  stopDev();
  process.exit(130);
});
let exitCode = 0;
try {
  currentStep = "setup";
  if (!state.keys || process.env.FRESH) {
    state.keys = { seller: generatePrivateKey(), buyer: generatePrivateKey() };
    delete state.ids;
    saveState();
  }
  const seller = privateKeyToAccount(state.keys.seller);
  const buyer = privateKeyToAccount(state.keys.buyer);
  state.addresses = { seller: seller.address, buyer: buyer.address };
  state.ids ||= {};
  saveState();
  log(`seller ${seller.address}  buyer ${buyer.address}  register ${CONTRACT}`);
  for (const [name, a] of [["seller", seller], ["buyer", buyer]]) {
    const b = await balance(a.address);
    if (b < 50n * 10n ** 18n) {
      const after = await fund(a.address);
      log(`funded ${name}: ${fmtGen(b)} → ${fmtGen(after)}`);
    } else log(`${name} already holds ${fmtGen(b)}`);
  }
  await startDev();
  await launch();
  const page = await newPage();

  // ---- a. reads without a wallet ----
  if (on("a")) {
    currentStep = "a";
    const targets = [
      ["/", "Packs listed", /Packs listed\s*\n?\s*\d|\d+\s*\n\s*Packs listed/],
      ["/shop", "Cold Email Templates", null],
      ["/ledger", "O1", null],
      ["/pack/L2", "Weeknight Vegetarian, 8 recipes", null],
    ];
    const lines = [];
    let pass = true;
    for (const [route, marker] of targets) {
      const s = Date.now();
      let dcl = 0;
      let dataMs = null;
      let extra = "";
      try {
        await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
        dcl = Date.now() - s;
        await waitText(page, marker, READ_TIMEOUT);
        dataMs = Date.now() - s;
        const t = await bodyText(page);
        if (route === "/") {
          const stats = (t.match(/(\d+)\s*\n\s*Packs listed[\s\S]*?(\d+)\s*\n\s*Orders/) || []).slice(1);
          extra = stats.length ? `stats packs=${stats[0]} orders=${stats[1]}` : "stats strip numbers not parsed";
          if (!/\d+\s*\n\s*Packs listed/.test(t)) {
            pass = false;
            extra += " — no number above 'Packs listed'";
          }
        }
        if (route === "/shop") {
          const cards = (t.match(/Buy|View/g) || []).length;
          extra = `${cards} cards; badges: ${(t.match(/Not delivered yet|Demo|Closed/g) || []).join(",")}`;
        }
        if (route === "/ledger") extra = `rows: ${(t.match(/\bO\d+\b/g) || []).length}; verdicts: ${(t.match(/breaks|keeps/g) || []).join(",")}`;
        if (route === "/pack/L2") extra = `badges: ${(t.match(/Not delivered yet|Demo|Closed/g) || []).join(",") || "none"}; orders listed: ${(t.match(/\bO\d+\b/g) || []).length}; hashes shown: ${(t.match(/[0-9a-f]{64}/g) || []).length}`;
        if (t.includes("Showing a snapshot")) extra += " — SNAPSHOT banner shown";
        if (t.includes("could not reach the network")) {
          extra += " — 'could not reach the network' shown";
          pass = false;
        }
      } catch (e) {
        pass = false;
        extra = "FAILED: " + String(e.message || e).slice(0, 200);
      }
      await shot(page, `a-${route.replace(/\W+/g, "_") || "home"}`);
      lines.push(`${route}: DOMContentLoaded ${dcl} ms, data on screen ${dataMs === null ? "never (timeout)" : dataMs + " ms"}; ${extra}`);
    }
    record("a. /, /shop, /ledger, /pack/L2 render real data without a wallet", pass ? "PASS" : "FAIL", lines.join(" || "));
  }

  // ---- b. seller lists demo pack 3 ----
  if (on("b")) {
    currentStep = "b";
    await cooldown();
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await waitText(page, "Connect wallet", 30_000);
      const addr = await connectHeader(page, "seller");
      const h = await headerText(page);
      observe(`header after connect: "${h.slice(-80)}"; wallet calls so far: ${JSON.stringify(await page.evaluate(() => window.__fakeWallet.calls))}`);
      await shot(page, "b-connected-seller");
      const r = await listDemo(page, "3.", "Cold Email Templates, 6 templates", "0.5 GEN");
      state.ids.emailPack = r.id;
      state.ids.emailListTx = r.txHash;
      saveState();
      await page.goto(BASE + "/shop", { waitUntil: "domcontentloaded" });
      await waitText(page, "Cold Email Templates", READ_TIMEOUT);
      const card = await page.evaluate((title) => {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        const heads = Array.from(document.querySelectorAll("h2,h3,p,span,div")).filter((e) => e.children.length === 0 && norm(e.innerText) === title);
        for (const h of heads) {
          let el = h;
          while (el && el !== document.body && !/\b(Buy|View)\b/.test(el.innerText)) el = el.parentElement;
          if (el && el !== document.body) return norm(el.innerText);
        }
        return null;
      }, "Cold Email Templates, 6 templates");
      await shot(page, `b-shop-with-${r.id}`);
      const uploadedOk = /"uploaded":\s*true/.test(r.statusAfter.body);
      const badge = card ? (card.includes("Not delivered yet") ? "shows 'Not delivered yet'" : "no 'not delivered' badge") : "card not found";
      observe(`shop card for the new pack: ${card}`);
      record(`b. seller connects, lists demo pack 3 (${r.id}) and uploads it`, uploadedOk && card && !card.includes("Not delivered yet") ? "PASS" : "FAIL", `connected as ${short(addr)}; list_pack tx ${r.txHash}; status after upload ${r.statusAfter.body}; shop card ${badge}`);
    } catch (e) {
      await shot(page, "b-FAIL");
      record("b. seller lists demo pack 3 and uploads", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- c. buyer buys the email pack and disputes section 1 vs P2 (expected keeps) ----
  if (on("c")) {
    currentStep = "c";
    await cooldown();
    try {
      if (!state.ids.emailPack) throw new Error("no email pack id from step b");
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      const addr = await connectHeader(page, "buyer");
      observe(`header shows the buyer ${short(addr)}: "${(await headerText(page)).slice(-60)}"`);
      await shot(page, "c-connected-buyer");
      const b = await buy(page, state.ids.emailPack, "0.5 GEN");
      state.ids.emailOrder = b.orderId;
      state.ids.emailOrderUrl = b.url;
      saveState();
      observe(`bought ${state.ids.emailPack} → ${b.orderId} in ${b.seconds.toFixed(0)} s; landed on ${b.url}`);
      const pack = await loadPack(page);
      observe(`pack loaded: ${JSON.stringify(pack)}`);
      await shot(page, `c-order-${b.orderId}-pack`);
      const countdown = ((await bodyText(page)).match(/In escrow · ([^\n]+)/) || [])[1] || "?";
      observe(`dispute window countdown when the dispute starts: ${countdown}`);
      const d = await dispute(page, b.orderId, 1, 2);
      const chain = d.judge?.hash ? await txInfo(d.judge.hash) : null;
      const ok = pack.signs === 1 && pack.matches === 6 && pack.mismatches === 0 && d.judge?.kind === "applied" && /Verdict: keeps/.test(d.verdictCard);
      record(
        `c. buyer buys ${state.ids.emailPack} (${b.orderId}), reads the pack after one signature, disputes section 1 vs P2 → keeps`,
        ok ? "PASS" : "FAIL",
        `buy ${b.seconds.toFixed(0)} s; pack: ${pack.counter} matched, ${pack.signs} personal_sign; bond rail ${d.bond?.kind} (${d.bond?.seconds?.toFixed(0)} s); judge rail ${d.judge?.kind} (${d.judge?.seconds?.toFixed(0)} s)${d.retried ? ", retried once" : ""}; votes "${d.votes}"; verdict card: "${d.verdictCard}"; status "${d.status}"; paid to seller: ${d.paidSeller ?? "not shown"}; paid to buyer: ${d.paidBuyer ?? "not shown"}; chain says ${chain ? `${chain.status} ${JSON.stringify(chain.tally)} ${chain.exec} ${chain.msg.slice(0, 160)}` : "n/a"}`,
      );
    } catch (e) {
      await shot(page, "c-FAIL");
      record("c. buyer buys the email pack and disputes section 1 vs P2", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- d. the breaks path ----
  if (on("d") || on("d1")) {
    currentStep = "d1";
    await cooldown();
    // d1: /pack/L2 as the task asks. L2 was listed by tests/on_chain/smoke.mjs with texts the site does not hold.
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "buyer");
      await page.goto(BASE + "/pack/L2", { waitUntil: "domcontentloaded" });
      await waitText(page, "Weeknight Vegetarian", READ_TIMEOUT);
      const l2 = await bodyText(page);
      observe(`/pack/L2 badges: ${(l2.match(/Not delivered yet|Demo|Closed/g) || []).join(",") || "none"}; notice: ${l2.includes("has not uploaded the pack contents yet") ? "'The seller has not uploaded the pack contents yet…' shown" : "no upload notice"}`);
      const b = await buy(page, "L2", "1 GEN");
      state.ids.l2Order = b.orderId;
      saveState();
      const pack = await loadPack(page);
      const t = await bodyText(page);
      const hasDispute = t.includes("This breaks a promise");
      const hasMissing = t.includes("Section missing?");
      await shot(page, `d1-order-${b.orderId}-L2`);
      observe(`L2 order ${b.orderId}: pack load → ${JSON.stringify(pack)}; 'This breaks a promise' buttons: ${hasDispute}; 'Section missing?' buttons: ${hasMissing}`);
      record(`d1. /pack/L2 → Pay → order ${b.orderId}: can the buyer dispute section 5?`, hasDispute ? "PASS" : "FAIL", `buy ${b.seconds.toFixed(0)} s; the site holds no text for L2 (listed by the on-chain smoke run): pack load said "${pack.error || pack.counter}"; ${pack.undelivered} sections 'not delivered'; dispute button present=${hasDispute}, missing button present=${hasMissing}`);
    } catch (e) {
      await shot(page, "d1-FAIL");
      record("d1. /pack/L2 → Pay → order page", "FAIL", String(e.message || e).slice(0, 300));
    }
  }
  if (on("d") || on("d2")) {
    currentStep = "d2";
    await cooldown();
    // d2: the same journey on a pack whose text the site can deliver: demo pack 1 (bacon in recipe 5), listed by our seller.
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "seller");
      const r = await listDemo(page, "1.", "Weeknight Vegetarian, 8 recipes", "1 GEN");
      state.ids.vegPack = r.id;
      saveState();
      await connectHeader(page, "buyer");
      const b = await buy(page, r.id, "1 GEN");
      state.ids.vegOrder = b.orderId;
      saveState();
      const pack = await loadPack(page);
      observe(`pack loaded: ${JSON.stringify(pack)}`);
      const balBefore = await balance(buyer.address);
      const d = await dispute(page, b.orderId, 5, 1);
      const judgedAt = Date.now();
      let landed = "never appeared";
      let landedAfter = null;
      if (d.judge?.kind === "applied") {
        const seen = await page
          .waitForFunction(() => document.body.innerText.includes("Refund landed") || document.body.innerText.includes("has not moved yet"), { timeout: 150_000, polling: 1000 })
          .then(() => true)
          .catch(() => false);
        landedAfter = (Date.now() - judgedAt) / 1000;
        const t = await bodyText(page);
        landed = t.includes("Refund landed") ? `"Refund landed in your wallet." after ${landedAfter.toFixed(0)} s` : t.includes("has not moved yet") ? `"Your balance has not moved yet…" after ${landedAfter.toFixed(0)} s` : seen ? "?" : `neither message within ${landedAfter.toFixed(0)} s (watching text present: ${t.includes("Watching your balance")})`;
      }
      const balAfter = await balance(buyer.address);
      await shot(page, `d2-order-${b.orderId}-refund`);
      const chain = d.judge?.hash ? await txInfo(d.judge.hash) : null;
      const ok = d.judge?.kind === "applied" && /Verdict: breaks/.test(d.verdictCard) && landed.startsWith('"Refund landed');
      record(
        `d2. buyer buys ${r.id} (${b.orderId}, demo pack 1 listed fresh), disputes section 5 vs P1 → breaks, waits for "Refund landed"`,
        ok ? "PASS" : "FAIL",
        `pack ${pack.counter} matched; bond ${d.bond?.kind} (${d.bond?.seconds?.toFixed(0)} s); judge ${d.judge?.kind} (${d.judge?.seconds?.toFixed(0)} s)${d.retried ? ", retried once" : ""}; votes "${d.votes}"; verdict card: "${d.verdictCard}"; paid to buyer: ${d.paidBuyer ?? "not shown"}; refund message: ${landed}; buyer balance ${fmtGen(balBefore)} → ${fmtGen(balAfter)} (rpc); chain: ${chain ? `${chain.status} ${JSON.stringify(chain.tally)} ${chain.exec} ${chain.msg.slice(0, 160)}` : "n/a"}`,
      );
    } catch (e) {
      await shot(page, "d2-FAIL");
      record("d2. breaks path on a freshly listed demo pack 1", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- e. wrong chain, disconnect, faucet ----
  if (on("e")) {
    currentStep = "e";
    await cooldown();
    try {
      const packId = state.ids.emailPack || "L4";
      const priceLabel = state.ids.emailPack ? "0.5 GEN" : "0.5 GEN";
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "buyer");
      await page.goto(BASE + `/pack/${packId}`, { waitUntil: "domcontentloaded" });
      await waitText(page, `Pay ${priceLabel}`, READ_TIMEOUT);
      await page.evaluate(() => window.__fakeWallet.setChain("0x1"));
      const bannerUp = await page.waitForFunction(() => !!document.querySelector('[role="alert"]') && document.querySelector('[role="alert"]').innerText.includes("Your wallet is on"), { timeout: 8000 }).then(() => true).catch(() => false);
      const banner = await page.evaluate(() => document.querySelector('[role="alert"]')?.innerText.replace(/\s+/g, " ").trim() || "");
      await sleep(500);
      const payStill = await page.evaluate((l) => Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes(`Pay ${l}`) && !!(b.offsetWidth || b.offsetHeight)), priceLabel);
      let refusal = "";
      if (payStill) {
        await click(page, "button", `Pay ${priceLabel}`);
        await sleep(2500);
        refusal = await page.evaluate(() => Array.from(document.querySelectorAll("p")).filter((p) => p.className.includes("text-breaks")).map((p) => p.innerText.trim()).join(" | "));
      } else {
        refusal = await page.evaluate(() => {
          const g = Array.from(document.querySelectorAll("div")).find((d) => d.innerText.includes("not GenLayer Studio") && d.children.length < 8);
          return g ? g.innerText.replace(/\s+/g, " ").trim() : "(gate text not found)";
        });
      }
      await shot(page, "e-wrong-chain");
      await page.evaluate(() => window.__fakeWallet.setChain("0xf22f"));
      const bannerGone = await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="alert"]')).some((a) => a.innerText.includes("Your wallet is on")), { timeout: 8000 }).then(() => true).catch(() => false);
      const payBack = await page.waitForFunction((l) => Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes(`Pay ${l}`)), { timeout: 8000 }, priceLabel).then(() => true).catch(() => false);
      await shot(page, "e-chain-restored");
      record("e1. wrong-chain banner appears on 0x1, Pay refuses with a sentence, 0xf22f clears it", bannerUp && refusal && bannerGone && payBack ? "PASS" : "FAIL", `banner: "${banner}"; Pay button still shown on 0x1: ${payStill}; refusal text: "${refusal}"; banner gone after switch back: ${bannerGone}; Pay back: ${payBack}`);
    } catch (e) {
      await shot(page, "e1-FAIL");
      record("e1. wrong-chain banner", "FAIL", String(e.message || e).slice(0, 300));
    }
    try {
      await page.goto(BASE + "/shop", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "buyer");
      const menuBtn = await page.$('header button[aria-haspopup="menu"]');
      const visibleMenuBtn = (await page.$$('header button[aria-haspopup="menu"]')).at(-1);
      await (visibleMenuBtn || menuBtn).click();
      await waitText(page, "Disconnect", 5000);
      await shot(page, "e-wallet-menu");
      const menuText = await page.evaluate(() => document.querySelector('[role="menu"]')?.innerText.replace(/\s+/g, " ").trim());
      await click(page, "button", "Disconnect", { exact: true });
      const forgot = await page.waitForFunction(() => (document.querySelector("header")?.innerText || "").includes("Connect wallet"), { timeout: 8000 }).then(() => true).catch(() => false);
      const stored = await page.evaluate(() => localStorage.getItem("as-described.wallet.rdns"));
      const walletState = await page.evaluate(() => ({ connected: window.__fakeWallet.connected(), revoke: window.__fakeWallet.calls.wallet_revokePermissions || 0 }));
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(3000);
      const afterReload = (await headerText(page)).includes("Connect wallet");
      await shot(page, "e-disconnected");
      record("e2. Disconnect from the wallet menu forgets the wallet", forgot && !stored && afterReload ? "PASS" : "FAIL", `menu: "${menuText}"; header shows Connect wallet: ${forgot}; localStorage rdns after: ${stored}; wallet_revokePermissions calls: ${walletState.revoke}; still disconnected after reload: ${afterReload}`);
    } catch (e) {
      await shot(page, "e2-FAIL");
      record("e2. Disconnect", "FAIL", String(e.message || e).slice(0, 300));
    }
    try {
      await connectHeader(page, "buyer");
      // after a load the header first prints 0 GEN; how long until the real balance shows?
      const t0b = Date.now();
      const settled = await page.waitForFunction(() => { const m = (document.querySelector("header")?.innerText || "").match(/(-?[\d.]+) GEN/); return m && m[1] !== "0"; }, { timeout: 20_000, polling: 250 }).then(() => true).catch(() => false);
      observe(`header balance after reconnect: ${settled ? `non-zero after ${((Date.now() - t0b) / 1000).toFixed(1)} s` : "still 0 GEN after 20 s"} (rpc says ${fmtGen(await balance(buyer.address))})`);
      const before = await headerBalance(page);
      const rpcBefore = await balance(buyer.address);
      (await page.$$('header button[aria-haspopup="menu"]')).at(-1).click();
      await waitText(page, "Get 10 test GEN", 5000);
      await cooldown(28); // sim_fundAccount shares the 30/min "standard" bucket with gen_call
      const s = Date.now();
      await click(page, "button,[role=button],a", "Get 10 test GEN");
      const moved = await page.waitForFunction((b) => { const m = (document.querySelector("header")?.innerText || "").match(/(-?[\d.]+) GEN/); return m && m[1] !== b; }, { timeout: 90_000, polling: 1000 }, before).then(() => true).catch(() => false);
      const after = await headerBalance(page);
      const secs = ((Date.now() - s) / 1000).toFixed(0);
      let rpcAfter = await balance(buyer.address);
      for (let i = 0; i < 20 && rpcAfter === rpcBefore; i++) { await sleep(3000); rpcAfter = await balance(buyer.address); }
      const menuErr = await page.evaluate(() => document.querySelector('[role="menu"]')?.innerText.replace(/\s+/g, " ").trim() || "");
      await shot(page, "e-faucet");
      const credited = rpcAfter - rpcBefore;
      record('e3. "Get 10 test GEN" changes the shown balance', moved && credited === 10n * 10n ** 18n && Number(after) > Number(before) ? "PASS" : "FAIL", `header ${before} GEN → ${after} GEN in ${secs} s; rpc ${fmtGen(rpcBefore)} → ${fmtGen(rpcAfter)} (credited ${fmtGen(credited)}); menu text after: "${menuErr}"`);
    } catch (e) {
      await shot(page, "e3-FAIL");
      record("e3. faucet", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- f. mobile ----
  if (on("f")) {
    currentStep = "f";
    await cooldown();
    const orderId = state.ids.vegOrder || state.ids.emailOrder || "O1";
    const lines = [];
    let pass = true;
    try {
      await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      for (const route of [`/order/${orderId}`, "/sell"]) {
        await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
        await waitText(page, route === "/sell" ? "Load a demo pack" : /Order O\d+|Thank you!/, READ_TIMEOUT);
        if (route !== "/sell") await sleep(2000);
        const m = await page.evaluate(() => {
          const wide = Array.from(document.querySelectorAll("body *"))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter((x) => x.r.right > 375.5 && x.r.width > 0)
            .slice(0, 6)
            .map((x) => `${x.el.tagName.toLowerCase()}${x.el.className && typeof x.el.className === "string" ? "." + x.el.className.split(/\s+/).slice(0, 3).join(".") : ""} right=${Math.round(x.r.right)}`);
          return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth, wide };
        });
        await shot(page, `f-mobile-${route.replace(/\W+/g, "_")}`);
        const ok = m.doc === 375 && m.body <= 375;
        if (!ok) pass = false;
        lines.push(`${route}: documentElement.scrollWidth=${m.doc}, body.scrollWidth=${m.body}, innerWidth=${m.inner}${m.wide.length ? "; overflowing: " + m.wide.join(", ") : ""}`);
      }
    } catch (e) {
      pass = false;
      lines.push("FAILED: " + String(e.message || e).slice(0, 200));
      await shot(page, "f-FAIL");
    } finally {
      await page.setViewport({ width: 1280, height: 900 });
    }
    record(`f. 375×812: /order/${orderId} and /sell have scrollWidth 375`, pass ? "PASS" : "FAIL", lines.join(" || "));
  }

  // ---- g. a visitor without a wallet on someone else's order ----
  if (on("g")) {
    currentStep = "g";
    await cooldown();
    const orderId = state.ids.emailOrder || state.ids.vegOrder || "O1";
    try {
      const ctx = await browser.createBrowserContext();
      const v = await newPage({ wallet: false, context: ctx });
      await v.goto(BASE + `/order/${orderId}`, { waitUntil: "domcontentloaded" });
      await waitText(v, /Order O\d+/, READ_TIMEOUT);
      await sleep(1500);
      const t = await bodyText(v);
      const packBlock = await v.evaluate(() => {
        const h = Array.from(document.querySelectorAll("h2")).find((x) => x.innerText.trim() === "The pack");
        const sec = h ? h.closest("section") : null;
        return sec ? sec.innerText.replace(/\s+/g, " ").trim() : "(no 'The pack' section)";
      });
      const headerNoWallet = (await headerText(v)).includes("Connect wallet");
      await shot(v, `g-visitor-order-${orderId}`);
      await ctx.close();
      // and the seller, a connected wallet that is not the buyer
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "seller");
      await page.goto(BASE + `/order/${orderId}`, { waitUntil: "domcontentloaded" });
      await waitText(page, /Order O\d+/, READ_TIMEOUT);
      await sleep(1500);
      const sellerBlock = await page.evaluate(() => {
        const h = Array.from(document.querySelectorAll("h2")).find((x) => x.innerText.trim() === "The pack");
        const sec = h ? h.closest("section") : null;
        return sec ? sec.innerText.replace(/\s+/g, " ").trim() : "(no 'The pack' section)";
      });
      await shot(page, `g-seller-on-buyers-order-${orderId}`);
      const statusLine = (t.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "?";
      record(`g. visitor without a wallet on /order/${orderId}`, packBlock.includes("Connect a wallet") ? "PASS" : "FAIL", `header: ${headerNoWallet ? "Connect wallet" : "?"}; status shown: "${statusLine}"; the pack block says: "${packBlock.slice(0, 400)}" || the seller (another connected wallet) sees: "${sellerBlock.slice(0, 300)}"`);
    } catch (e) {
      await shot(page, "g-FAIL");
      record("g. visitor without a wallet", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // wallet log for the evidence file
  try {
    state.walletLog = await page.evaluate(() => ({ calls: window.__fakeWallet.calls, signed: window.__fakeWallet.log.filter((l) => l.method === "signed") }));
  } catch {}
} catch (e) {
  exitCode = 1;
  log("RUN FAILED:", e && e.stack ? e.stack : String(e));
  record("run", "FAIL", String(e.message || e).slice(0, 300));
} finally {
  const report = { finishedAt: new Date().toISOString(), contract: CONTRACT, addresses: state.addresses, ids: state.ids, results, notes, consoleErrors, netFailures, walletLog: state.walletLog || null };
  writeFileSync(path.join(SCRATCH, "report.json"), JSON.stringify(report, null, 2));
  saveState();
  console.log("\n==== RESULTS ====");
  for (const r of results) console.log(`${r.result.padEnd(7)} ${r.step}\n        ${r.note}`);
  console.log(`\nconsole errors/warnings: ${consoleErrors.length}, failed responses: ${netFailures.length}`);
  for (const c of consoleErrors.slice(0, 40)) console.log(`  [${c.step}] ${c.type} ${c.page} :: ${c.text.slice(0, 220)}`);
  for (const n of netFailures.slice(0, 40)) console.log(`  [${n.step}] ${n.status || n.error} ${n.method} ${n.url.slice(0, 160)} (on ${n.page})`);
  console.log(`\nreport: ${path.join(SCRATCH, "report.json")}\nshots:  ${SHOTS}`);
  if (browser) await browser.close().catch(() => {});
  stopDev();
  await sleep(1500);
  process.exit(exitCode || (results.some((r) => r.result === "FAIL") ? 2 : 0));
}
