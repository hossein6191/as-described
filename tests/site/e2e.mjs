/* End-to-end run of the As Described site against GenLayer Studio, with two throwaway
 * wallets played by tests/site/fake-wallet.js inside headless Chrome.
 *
 *   CONTRACT=0x… node tests/site/e2e.mjs           # everything: starts `next dev -p 3120`, runs steps a to g
 *   CONTRACT=0x… STEPS=a,e,f node tests/site/e2e.mjs   # a subset (ids from the last run are reused from state.json)
 *   CONTRACT=0x… STEPS=r node tests/site/e2e.mjs       # only the missing-section path (report, reveal, dispute)
 *   FRESH=1 node tests/site/e2e.mjs                # new keys (the default reuses funded keys from state.json)
 *   SITE_FAUCET=0 node tests/site/e2e.mjs          # skip the funding call made through the site's own button
 *   HEADFUL=1 node tests/site/e2e.mjs              # watch the browser
 *
 * CONTRACT is required and must be a throwaway register: the run lists packs, buys them and
 * judges sections, so it never points at the register the site ships with (lib/config.ts).
 *
 * The buyer is funded once per run through the site's own "Get 10 test GEN" button, because the
 * wallet hands the site a lowercase address and Studio's faucet silently drops a lowercase
 * account_address. Funding through the harness's own RPC call would hide that.
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
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRATCH = process.env.E2E_SCRATCH || path.join(os.tmpdir(), "as-described-e2e");
const SHOTS = path.join(SCRATCH, "shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.PORT || 3120);
const BASE = `http://localhost:${PORT}`;
const RPC = "https://studio.genlayer.com/api";
const RAIL_TIMEOUT = 240_000;
const READ_TIMEOUT = 90_000;
const GEN = 10n ** 18n;

// ---------- the register under test ----------
const CONTRACT = process.env.CONTRACT || "";
if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
  throw new Error("set CONTRACT to a throwaway register, e.g. CONTRACT=0x… node tests/site/e2e.mjs");
}
// The address the site ships with belongs to the owner: the harness never writes to it.
const SITE_REGISTER = (readFileSync(path.join(REPO, "lib", "config.ts"), "utf8").match(/DEMO_CONTRACT\s*=\s*"(0x[0-9a-fA-F]{40})"/) || [])[1] || "";
if (SITE_REGISTER && SITE_REGISTER.toLowerCase() === CONTRACT.toLowerCase()) {
  throw new Error("CONTRACT is the register the site ships with; deploy a throwaway one and use that");
}

const STEPS = (process.env.STEPS || "v,a,s,b,c,d,r,e,f,g").split(",").map((s) => s.trim());
const on = (s) => STEPS.includes(s);

mkdirSync(SHOTS, { recursive: true });
const STATE_FILE = path.join(SCRATCH, "state.json");
const state = existsSync(STATE_FILE) && !process.env.FRESH ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
// Listing and order ids belong to one register; keys are funded accounts and are kept.
if (state.contract && state.contract.toLowerCase() !== CONTRACT.toLowerCase()) delete state.ids;
state.contract = CONTRACT;

// ---------- reporting ----------
const results = []; // { step, result, note }
const consoleErrors = []; // { step, page, type, text }
const netFailures = []; // { step, page, status, method, url }
const faucetCalls = []; // { step, account_address, amount } as the site sent them
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
  log(`${result}  ${step}  :: ${note}`);
};
const observe = (text) => {
  notes.push(`[${currentStep}] ${text}`);
  log("note:", text);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (a) => (a ? a.toLowerCase().slice(0, 6) + "…" + a.toLowerCase().slice(-4) : ""); // the site prints addresses lowercase
const fmtGen = (atto) => (Number(atto) / 1e18).toFixed(3) + " GEN";
/** What the contract asks as a bond: 20% of the price, never under 0.01 GEN. */
const bondFor = (priceGen) => {
  const atto = BigInt(Math.round(Number(priceGen) * 1e18));
  const fifth = atto / 5n;
  const b = fifth > GEN / 100n ? fifth : GEN / 100n;
  const whole = b / GEN;
  const frac = (b % GEN).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""} GEN`;
};

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
/** The harness's own faucet call, for the seller and as a fallback: Studio drops a lowercase address. */
async function fund(addr) {
  const before = await balance(addr);
  await rpc("sim_fundAccount", { account_address: getAddress(addr), amount: 200e18 });
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
    observe(`a server already answers on ${BASE}; reusing it (it is not killed at the end). Its register is checked before anything is signed.`);
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
  page.on("request", (r) => {
    // What the site asks the faucet for, exactly as it sends it: Studio ignores a lowercase address.
    if (r.method() !== "POST" || !r.url().startsWith(RPC)) return;
    const body = r.postData();
    if (!body || !body.includes("sim_fundAccount")) return;
    try {
      const p = JSON.parse(body).params || {};
      faucetCalls.push({ step: currentStep, account_address: p.account_address, amount: p.amount });
      log(`the site called sim_fundAccount with ${p.account_address}`);
    } catch {}
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
/** The sell page keeps List disabled until stats() says whether the register takes a stake. */
async function waitListReady(page) {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some((b) => /^List for /.test((b.innerText || "").trim()) && !b.disabled),
    { timeout: READ_TIMEOUT, polling: 500 },
  );
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
/** The label of the button that opens the promise dialog on a section row (app/order/[id]/page.tsx). */
const DISPUTE_BUTTON = "Dispute this section";
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
/** Every "Section N" card of the order page: its header line, its text and its buttons. */
const sectionRows = (page) =>
  page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll("ol > li"))
      .map((li) => {
        const head = li.querySelector("span.font-medium");
        const m = head && norm(head.innerText).match(/^Section (\d+)$/);
        if (!m) return null;
        const bar = head.parentElement;
        const pre = li.querySelector("pre");
        return {
          n: Number(m[1]),
          head: norm(bar ? bar.innerText : ""),
          text: norm(pre ? pre.innerText : ""),
          buttons: Array.from(li.querySelectorAll("button"))
            .filter((b) => b.offsetWidth || b.offsetHeight)
            .map((b) => norm(b.innerText)),
        };
      })
      .filter(Boolean);
  });
const rowState = (row) =>
  /delivered as committed/.test(row.head)
    ? "ok"
    : /does not match the committed hash/.test(row.head)
      ? "mismatch"
      : /reported missing/.test(row.head)
        ? "missing"
        : /not delivered/.test(row.head)
          ? "undelivered"
          : "other";
/** Types into a React-controlled input or textarea exactly (no keystrokes: the text must hash). */
async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
  await page.$eval(
    selector,
    (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
  const got = await page.$eval(selector, (el) => el.value);
  if (got !== value) throw new Error(`${selector} holds ${got.length} characters, not the ${value.length} that were set`);
}
async function fillHandle(el, value) {
  await el.evaluate((node, v) => {
    const proto = node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, v);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const got = await el.evaluate((node) => node.value);
  if (got !== value) throw new Error(`the box holds ${got.length} characters, not the ${value.length} that were set`);
}
/** The "Add" (or other) button of the form section whose <h2> is `heading`. */
async function clickUnderHeading(page, heading, buttonText) {
  const handle = await page.evaluateHandle(
    (heading, buttonText) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const h = Array.from(document.querySelectorAll("h2")).find((x) => norm(x.innerText) === heading);
      const sec = h ? h.closest("section") : null;
      const b = sec ? Array.from(sec.querySelectorAll("button")).find((x) => norm(x.innerText).includes(buttonText)) : null;
      if (b) b.scrollIntoView({ block: "center" });
      return b || null;
    },
    heading,
    buttonText,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no "${buttonText}" button under the "${heading}" heading`);
  await el.click();
}
/** One of the sell page's kind tabs ("recipes", "templates", …). */
async function clickKindTab(page, kind) {
  const handle = await page.evaluateHandle((kind) => {
    const b = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.innerText.toLowerCase().includes(kind));
    if (b) b.scrollIntoView({ block: "center" });
    return b || null;
  }, kind);
  const el = handle.asElement();
  if (!el) throw new Error(`no "${kind}" tab on the sell page`);
  await el.click();
}
const dialogText = (page) =>
  page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).find((x) => x.offsetWidth || x.offsetHeight);
    return d ? d.innerText.replace(/\s+/g, " ").trim() : "";
  });
async function waitDialog(page, timeout = 15_000) {
  await page.waitForFunction(
    () => {
      const d = Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).find((x) => x.offsetWidth || x.offsetHeight);
      return !!d && /promise/i.test(d.innerText);
    },
    { timeout, polling: 300 },
  );
}
/** Picks promise Pn in the open dialog, and presses its confirmation button when it has one. */
async function pickPromise(page, n) {
  const problem = await page.evaluate((n) => {
    const d = Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).find((x) => x.offsetWidth || x.offsetHeight);
    if (!d) return "the dialog is not open";
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const re = new RegExp(`^P${n}\\b`);
    const el = Array.from(d.querySelectorAll('button, [role="radio"], [role="radiogroup"] label, label')).find((x) => re.test(norm(x.innerText)));
    if (!el) return `the dialog offers no P${n}`;
    el.click();
    return "";
  }, n);
  if (problem) throw new Error(problem);
  await sleep(400);
  // A dialog that asks for a confirmation after the pick shows a "Post … bond" button.
  return await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).find((x) => x.offsetWidth || x.offsetHeight);
    if (!d) return "";
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const b = Array.from(d.querySelectorAll("button")).find((x) => /^Post\b.*bond/i.test(norm(x.innerText)) && !x.disabled);
    if (!b) return "";
    b.click();
    return norm(b.innerText);
  });
}
/** The order page offers "Re-read the order" when its re-reads ran out; pressing it is always safe. */
async function nudge(page) {
  return await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const b = Array.from(document.querySelectorAll("button")).find((x) => /Re-read the order/i.test(norm(x.innerText)) && (x.offsetWidth || x.offsetHeight) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  });
}
/** Waits for `test()` on the page's text, pressing "Re-read the order" whenever it is offered. */
async function waitOrder(page, re, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (re.test(await bodyText(page))) return true;
    await nudge(page);
    await sleep(2000);
  }
  return false;
}
/** Text of every TxRail whose label contains `label` ([data-tx] wrappers). */
const railText = (page, label) =>
  page.evaluate((label) => {
    const rails = Array.from(document.querySelectorAll("[data-tx]")).filter((r) => r.innerText.includes(label));
    return rails.map((r) => ({ hash: r.getAttribute("data-tx"), text: r.innerText.replace(/\s+/g, " ").trim() }));
  }, label);
const FINAL_RE = /Finalized\.|Finalized;|The contract refused|validators split|no majority|cancelled this transaction|did not accept/;
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
        const kind = /validators split|no majority/.test(last.text) ? "split" : /refused|did not accept|cancelled/.test(last.text) ? "refused" : "applied";
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
/** The site under test must read the register this run was given, whoever started the server. */
async function assertRegister(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const shown = await page
    .waitForFunction(
      (c) => Array.from(document.querySelectorAll('a[href*="/address/"]')).some((a) => (a.getAttribute("title") || a.getAttribute("href") || "").toLowerCase().includes(c)),
      { timeout: 30_000, polling: 500 },
      CONTRACT.toLowerCase(),
    )
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    const line = await page.evaluate(() => (document.querySelector("footer")?.innerText || "").replace(/\s+/g, " ").trim());
    throw new Error(`the site on ${BASE} does not read ${CONTRACT} (footer says "${line.slice(0, 160)}"); refusing to sign anything against it`);
  }
  observe(`the site under test reads ${CONTRACT}`);
}

// ---------- flows ----------

/**
 * Funds `name` through the site's own button, never through the harness's RPC call: the wallet
 * hands the site a lowercase address, and Studio credits nothing when it is not checksummed.
 */
async function siteFaucet(page, name, account) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await waitText(page, "Connect wallet", 30_000).catch(() => {});
  const addr = await connectHeader(page, name);
  const reported = await page.evaluate(() => window.ethereum.request({ method: "eth_accounts" }));
  const lower = Array.isArray(reported) && reported[0] === String(reported[0]).toLowerCase();
  const before = await balance(account.address);
  const headerBefore = await headerBalance(page);
  await cooldown(28); // sim_fundAccount shares the 30/min "standard" bucket with gen_call
  const sentBefore = faucetCalls.length;
  // The guide offers the button while the wallet shows 0 GEN; the wallet menu always has it.
  let via = "the guide";
  let btn = null;
  if (before === 0n) {
    for (let i = 0; i < 20 && !btn; i++) {
      const h = await page.evaluateHandle(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => !x.closest("header") && /^Get 10 test GEN$/.test(x.innerText.replace(/\s+/g, " ").trim()) && (x.offsetWidth || x.offsetHeight));
        if (b) b.scrollIntoView({ block: "center" });
        return b || null;
      });
      btn = h.asElement();
      if (!btn) await sleep(1000);
    }
  }
  if (!btn) {
    via = "the wallet menu";
    const menuBtn = (await page.$$('header button[aria-haspopup="menu"]')).at(-1);
    if (!menuBtn) throw new Error("no wallet menu in the header");
    await menuBtn.click();
    await waitText(page, "Get 10 test GEN", 8000);
    const h = await page.evaluateHandle(() => {
      const menu = document.querySelector('[role="menu"]');
      const b = menu ? Array.from(menu.querySelectorAll("button, [role=button], a")).find((x) => x.innerText.replace(/\s+/g, " ").trim().includes("Get 10 test GEN")) : null;
      return b || null;
    });
    btn = h.asElement();
    if (!btn) throw new Error("the wallet menu has no \"Get 10 test GEN\" button");
  }
  const started = Date.now();
  await btn.click();
  let after = before;
  while (Date.now() - started < 85_000 && after === before) {
    await sleep(2500);
    after = await balance(account.address);
  }
  const seconds = (Date.now() - started) / 1000;
  const headerAfter = await headerBalance(page);
  const pageError = await page.evaluate(() => {
    const hits = Array.from(document.querySelectorAll("p, div")).map((e) => e.innerText || "").filter((t) => /faucet|did not credit/i.test(t) && t.length < 200);
    return hits.length ? hits[hits.length - 1].replace(/\s+/g, " ").trim() : "";
  });
  const sent = faucetCalls.slice(sentBefore).map((c) => c.account_address);
  const checksummed = sent.length > 0 && sent.every((a) => a === getAddress(account.address));
  await shot(page, `s-site-faucet-${name}`);
  return { addr, lower, via, before, after, seconds, headerBefore, headerAfter, pageError, sent, checksummed, credited: after - before };
}

/** Lists one demo pack as the connected seller through /sell. A demo pack needs no upload. */
async function listDemo(page, { title, kind, price }) {
  await page.goto(`${BASE}/sell`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Load a demo pack", 30_000);
  await clickKindTab(page, kind);
  await sleep(300);
  const loaded = await page.evaluateHandle((title) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const p = Array.from(document.querySelectorAll("p")).find((x) => norm(x.innerText) === title);
    if (!p) return null;
    // the card is the nearest box around the title that carries a Load button
    for (let el = p; el && el !== document.body; el = el.parentElement) {
      const b = Array.from(el.querySelectorAll("button")).find((x) => norm(x.innerText) === "Load");
      if (b) {
        b.scrollIntoView({ block: "center" });
        return b;
      }
    }
    return null;
  }, title);
  const loadBtn = loaded.asElement();
  if (!loadBtn) throw new Error(`no demo card called "${title}" under the ${kind} tab`);
  await loadBtn.click();
  await page.waitForFunction((t) => document.querySelector("#title")?.value === t, { timeout: 10_000, polling: 200 }, title);
  const windowText = await page.$eval("#window", (el) => el.innerText.trim());
  const priceText = await page.$eval("#price", (el) => el.value);
  observe(`demo card "${title}" filled price=${priceText} GEN, window="${windowText}"`);
  await shot(page, "sell-form-filled");
  const signsBefore = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  await waitListReady(page);
  await click(page, "button", `List for ${price}`);
  const sent = await page.waitForFunction(() => !!document.querySelector("[data-tx]") || Array.from(document.querySelectorAll("p")).some((p) => /text-breaks/.test(p.className) && p.innerText.trim()), { timeout: 60_000 }).then(() => true).catch(() => false);
  if (!sent) throw new Error("no transaction rail and no error appeared within 60 s of pressing List");
  const early = await page.evaluate(() => Array.from(document.querySelectorAll("p.text-breaks, p[class*='text-breaks']")).map((p) => p.innerText.trim()).filter(Boolean));
  if (early.length && !(await page.$("[data-tx]"))) throw new Error("List refused before sending: " + early.join(" | "));
  const rail = await waitRail(page, "Listing the pack");
  observe(`list_pack rail (${rail.seconds.toFixed(0)} s): ${rail.text}`);
  await shot(page, "sell-listed-rail");
  if (rail.kind !== "applied") throw new Error(`list_pack ended ${rail.kind}: ${rail.text}`);
  // A demo pack's text ships with the site, so the page goes straight to "Your pack is live."
  await waitText(page, /Your pack is live\.|Open L\d+|Listed as L\d+/, 60_000);
  const done = await bodyText(page);
  const id = (done.match(/Open (L\d+)/) || done.match(/Listed as (L\d+)/) || [])[1];
  if (!id) throw new Error("the sell page did not print the listing id");
  const signsAfter = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  const live = /Your pack is live\./.test(done);
  const status = await checkStatus(id);
  await shot(page, `sell-listed-${id}`);
  observe(`${id} listed: ${signsAfter - signsBefore} personal_sign call(s) (a demo pack needs none); GET /api/packs/${id}/status: ${status.http} ${status.body}`);
  return { id, txHash: rail.hash, live, signs: signsAfter - signsBefore, status };
}

/** Lists a pack of our own and stops before the upload, so every section is "not delivered". */
async function listCustom(page, pack) {
  await page.goto(`${BASE}/sell`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Load a demo pack", 30_000);
  await clickKindTab(page, pack.kind);
  await fill(page, "#title", pack.title);
  for (let i = 0; i < pack.promises.length; i++) {
    if (i > 0) await clickUnderHeading(page, "Promises", "Add");
    await fill(page, `input[aria-label="Promise ${i + 1}"]`, pack.promises[i]);
  }
  for (let i = 0; i < pack.sections.length; i++) {
    if (i > 0) await clickUnderHeading(page, "Sections", "Add");
    await fill(page, `#section-${i}`, pack.sections[i]);
  }
  await fill(page, "#price", pack.price);
  await shot(page, "r-sell-custom-filled");
  // A host with no pack store can only list demo packs, and the page says so instead of listing.
  const blocked = /no storage for uploaded packs|no pack store|only demo packs/i.test(await bodyText(page));
  if (blocked) throw new Error("this deployment has no pack store, so a pack of our own cannot be listed here");
  await waitListReady(page);
  await click(page, "button", `List for ${pack.price} GEN`);
  const rail = await waitRail(page, "Listing the pack");
  observe(`list_pack (our own pack) rail (${rail.seconds.toFixed(0)} s): ${rail.text}`);
  if (rail.kind !== "applied") throw new Error(`list_pack ended ${rail.kind}: ${rail.text}`);
  await waitText(page, /Listed as L\d+|Open L\d+/, 60_000);
  const t = await bodyText(page);
  const id = (t.match(/Listed as (L\d+)/) || t.match(/Open (L\d+)/) || [])[1];
  if (!id) throw new Error("the sell page did not print the listing id");
  const asksUpload = /Sign and upload/.test(t);
  await shot(page, `r-listed-${id}`);
  observe(`${id} is listed and deliberately left un-uploaded (the page asks for the upload: ${asksUpload})`);
  return { id, txHash: rail.hash, asksUpload };
}

/** Buys a pack as the connected buyer; returns { orderId, url, seconds, rail }. */
async function buy(page, listingId, priceLabel) {
  await page.goto(`${BASE}/pack/${listingId}`, { waitUntil: "domcontentloaded" });
  await waitText(page, `Pay ${priceLabel}`, READ_TIMEOUT);
  // A page reading the snapshot disables Pay; wait for the live read before pressing it.
  const ready = await page
    .waitForFunction((l) => Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes(`Pay ${l}`) && !b.disabled && (b.offsetWidth || b.offsetHeight)), { timeout: 60_000, polling: 500 }, priceLabel)
    .then(() => true)
    .catch(() => false);
  if (!ready) throw new Error(`the "Pay ${priceLabel}" button never enabled (a snapshot read, a closed pack, or the seller's own wallet)`);
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

const DELIVERED = /(\d+)\/(\d+) delivered as committed/;
/** Signs once and loads the pack on the order page; returns the counter and the section rows. */
async function loadPack(page) {
  const signsBefore = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  await page.waitForFunction(
    (src) => {
      const t = document.body.innerText;
      return t.includes("Sign to read the pack") || new RegExp(src).test(t) || t.includes("Connect a wallet to read your pack");
    },
    { timeout: READ_TIMEOUT, polling: 500 },
    DELIVERED.source,
  );
  const first = await bodyText(page);
  if (first.includes("Sign to read the pack") && !DELIVERED.test(first)) await click(page, "button", "Sign to read the pack");
  await page.waitForFunction(
    (src) => new RegExp(src).test(document.body.innerText) || Array.from(document.querySelectorAll("p")).some((p) => p.className.includes("text-breaks") && p.innerText.trim()),
    { timeout: 60_000 },
    DELIVERED.source,
  );
  const t = await bodyText(page);
  const signsAfter = await page.evaluate(() => window.__fakeWallet.calls.personal_sign || 0);
  const m = t.match(DELIVERED);
  const rows = await sectionRows(page);
  const err = await page.evaluate(() => Array.from(document.querySelectorAll("p")).filter((p) => p.className.includes("text-breaks")).map((p) => p.innerText.trim()).join(" | "));
  return {
    counter: m ? `${m[1]}/${m[2]}` : null,
    rows,
    matches: rows.filter((r) => rowState(r) === "ok").length,
    mismatches: rows.filter((r) => rowState(r) === "mismatch").length,
    undelivered: rows.filter((r) => rowState(r) === "undelivered").length,
    signs: signsAfter - signsBefore,
    error: err,
  };
}

/** The little details card under the ticket: Status, Bond to dispute / Bond posted, payouts. */
const detailsText = (page) =>
  page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll("div")).filter((d) => /\bStatus\b/.test(d.innerText) && /Dispute window/.test(d.innerText));
    boxes.sort((a, b) => a.querySelectorAll("div").length - b.querySelectorAll("div").length);
    return boxes.length ? boxes[0].innerText : document.body.innerText;
  });

/**
 * Disputes `section` against promise `promiseNo` on the open order page, through bond and verdict.
 * `sectionText` is only pasted when the page cannot find the text itself, which is a finding of its own.
 */
async function dispute(page, orderId, section, promiseNo, { bondExpected = "", snippet = "", sectionText = "" } = {}) {
  const out = { bond: null, judge: null, dialog: "", confirm: "", bondShown: null, bondToDispute: null, pasted: false, verdictCard: "", judgedText: false, judgeGone: null, votes: "", status: "", paidSeller: null, paidBuyer: null, retried: false };
  await clickInSection(page, section, DISPUTE_BUTTON);
  await waitDialog(page);
  out.dialog = (await dialogText(page)).slice(0, 220);
  await shot(page, `order-${orderId}-pick-promise`);
  out.confirm = await pickPromise(page, promiseNo);
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
  let enabled = false;
  for (let i = 0; i < 60 && !enabled; i++) {
    enabled = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /Ask the validators/.test(x.innerText));
      return !!b && !b.disabled;
    });
    if (enabled) break;
    await nudge(page);
    // The judged text comes from the loaded pack; a page that cannot find it asks for a paste.
    if (i > 8 && sectionText && !out.pasted) {
      const box = await page.evaluateHandle(() => Array.from(document.querySelectorAll("textarea")).find((t) => /Paste the exact text/.test(t.placeholder || "")) || null);
      const el = box.asElement();
      if (el) {
        await fillHandle(el, sectionText);
        out.pasted = true;
        observe("the page did not hold the disputed section text, so the harness pasted it");
      }
    }
    await sleep(2000);
  }
  const nowLook = await page.evaluate(() => ({ status: (document.body.innerText.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "?", pasteBox: !!Array.from(document.querySelectorAll("textarea")).find((t) => /Paste the exact text/.test(t.placeholder || "")) }));
  observe(`after the bond: the button first appeared disabled=${firstLook.disabled} with paste box=${firstLook.pasteBox} (status "${firstLook.status}"); enabled after ${((Date.now() - appeared) / 1000).toFixed(1)} s: ${enabled} (status "${nowLook.status}", paste box=${nowLook.pasteBox})`);
  if (!enabled) throw new Error("the Ask the validators button never enabled within 2 minutes of the bond finalizing");
  // The bond is posted: the details card stops asking for one and shows what was posted.
  // The row carries the amount and then what became of it ("0.2 GEN, held" / ", returned"),
  // so the amount is read on its own and the whole row is kept for the record.
  const details = await detailsText(page);
  out.bondRow = (details.match(/Bond posted\s*\n?\s*([^\n]+)/) || [])[1] || null;
  out.bondShown = out.bondRow ? (out.bondRow.match(/^[\d.]+ GEN/) || [])[0] || out.bondRow : null;
  out.bondToDispute = /Bond to dispute/.test(details);
  observe(`the details card after the bond: bond posted "${out.bondRow ?? "not shown"}"${bondExpected ? `, expected ${bondExpected}` : ""}; still asking "Bond to dispute": ${out.bondToDispute}`);
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
  await waitOrder(page, /Verdict:/, 90_000);
  const t = await bodyText(page);
  out.verdictCard = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("section")).find((x) => x.innerText.includes("Verdict:"));
    return s ? s.innerText.replace(/\s+/g, " ").trim() : "";
  });
  // UX-09: the card shows the exact text the validators read, for anyone who opens the order.
  out.judgedText = /text the validators read/i.test(out.verdictCard) && (!snippet || out.verdictCard.includes(snippet));
  out.judgeGone = !(await page.evaluate(() => Array.from(document.querySelectorAll("button")).some((b) => /Ask the validators|Try again/.test(b.innerText) && (b.offsetWidth || b.offsetHeight))));
  out.status = (t.match(/Status\s*\n\s*([^\n]+)/) || [])[1] || "";
  out.paidSeller = (t.match(/Paid to seller\s*\n\s*([^\n]+)/) || [])[1] || null;
  out.paidBuyer = (t.match(/Paid to buyer\s*\n\s*([^\n]+)/) || [])[1] || null;
  await shot(page, `order-${orderId}-verdict`);
  return out;
}

/** Opens the promise dialog on a 375 px screen and measures it, then closes it again. */
async function dialogOnPhone(page, section) {
  await page.setViewport({ width: 375, height: 812 });
  await sleep(800);
  await clickInSection(page, section, DISPUTE_BUTTON);
  await waitDialog(page);
  const m = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).find((x) => x.offsetWidth || x.offsetHeight);
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), inner: window.innerHeight, scrollH: d.scrollHeight, clientH: d.clientHeight, overflowY: cs.overflowY, docW: document.documentElement.scrollWidth };
  });
  await shot(page, "r-dialog-375");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"]')).some((x) => x.offsetWidth || x.offsetHeight), { timeout: 8000 }).catch(() => {});
  await page.setViewport({ width: 1280, height: 900 });
  await sleep(500);
  if (!m) return { ok: false, note: "the dialog did not open at 375 px" };
  const fits = m.top >= -1 && m.bottom <= m.inner + 1;
  const scrolls = /auto|scroll/.test(m.overflowY);
  return { ok: (fits || scrolls) && m.docW <= 376, note: `top ${m.top}, bottom ${m.bottom} of ${m.inner}, content ${m.scrollH} in ${m.clientH}, overflow-y ${m.overflowY}, page width ${m.docW}` };
}

// The pack of our own used by step r: section 2 is reported missing, revealed, then disputed.
const REVEAL_PACK = {
  title: "House notes, 3 sections (test pack)",
  kind: "other",
  promises: ["Every note is under 60 words.", "No note mentions a colour."],
  sections: [
    "Note 1: Keep a spare key with a neighbour you trust, and write their number inside the cupboard door by the kettle.",
    "Note 2: Paint the shed door red before the autumn rain, so the wood does not swell and stick in the frame.",
    "Note 3: Test the smoke alarm on the first day of every month, and change its battery every spring.",
  ],
  price: "0.5",
  section: 2, // 1-based, as the page numbers them
  promise: 2,
  snippet: "Paint the shed door red",
};

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
  // The seller only signs; the buyer is funded through the site (step s), which is the point of it.
  const sellerBalance = await balance(seller.address);
  if (sellerBalance < 50n * GEN) {
    const after = await fund(seller.address);
    log(`funded the seller: ${fmtGen(sellerBalance)} to ${fmtGen(after)}`);
  } else log(`the seller already holds ${fmtGen(sellerBalance)}`);
  await startDev();
  await launch();
  const page = await newPage();
  await assertRegister(page);

  // ---- v. the register vetting, which no page can reach ----
  // This run sets CONTRACT, which makes the throwaway register the site default, and
  // checkRegister short-circuits on the site default before any of the vetting runs. So the
  // only way to execute it is to name a register the site does not ship with, which is what a
  // visitor who deployed their own from /deploy does. It runs first, before any page has spent
  // the caller's per-minute budget on this dev server.
  if (on("v")) {
    currentStep = "v";
    const lines = [];
    let pass = true;
    const ask = async (query) => {
      const r = await fetch(`${BASE}/api/packs/L1/status${query}`, { cache: "no-store" });
      let body = {};
      try {
        body = JSON.parse(await r.text());
      } catch {}
      return { http: r.status, reason: String(body.reason || ""), uploaded: body.uploaded };
    };
    const say = (what, got, want) => {
      const good = want(got);
      if (!good) pass = false;
      lines.push(`${good ? "ok" : "NO"} ${what}: ${got.http}${got.reason ? ` "${got.reason.slice(0, 90)}"` : ""}`);
    };
    try {
      say("no register names the site default", await ask(""), (g) => g.http === 200);
      say("the site default by name", await ask(`?register=${CONTRACT}`), (g) => g.http === 200);
      say("a register that is not an address", await ask("?register=not-an-address"), (g) => g.http === 400 && /must be a 0x address/.test(g.reason));
      // Three addresses Studio has no contract at: each one is a real gen_getContractCode, and
      // three is all one caller gets in a minute (lib/budget.ts).
      const madeUp = ["0x00000000000000000000000000000000000000a1", "0x00000000000000000000000000000000000000a2", "0x00000000000000000000000000000000000000a3"];
      for (const a of madeUp) say(`an address with no contract (${a.slice(-4)})`, await ask(`?register=${a}`), (g) => g.http === 400 && /has no contract/.test(g.reason));
      const fourth = await ask("?register=0x00000000000000000000000000000000000000a4");
      say("a fourth new register from the same caller", fourth, (g) => g.http === 503 && /checked many new registers/.test(g.reason));
      // The finding this closes: one caller spending the lookups used to answer 503 for everybody.
      say("the site default still answers after that", await ask(""), (g) => g.http === 200);
      say("a listing id that is a traversal", await ask("?register=" + CONTRACT).then(() => fetch(`${BASE}/api/packs/..%2F..%2Fetc/status`, { cache: "no-store" })).then(async (r) => ({ http: r.status, reason: String(((await r.json().catch(() => ({}))) || {}).reason || "") })), (g) => g.http === 400);
    } catch (e) {
      pass = false;
      lines.push("FAILED: " + String(e.message || e).slice(0, 200));
    }
    record("v. the delivery API vets a register it does not ship with, and one caller cannot spend everybody's lookups", pass ? "PASS" : "FAIL", lines.join(" || "));
  }

  // ---- a. reads without a wallet ----
  if (on("a")) {
    currentStep = "a";
    const lines = [];
    let pass = true;
    let firstPack = null;
    let stats = { packs: null, orders: null };
    try {
      // the landing page: the live numbers from stats()
      let s = Date.now();
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await waitText(page, /\d+\s*\n\s*Packs listed/, READ_TIMEOUT);
      const home = await bodyText(page);
      const nums = (home.match(/(\d+)\s*\n\s*Packs listed[\s\S]*?(\d+)\s*\n\s*Orders/) || []).slice(1);
      stats = { packs: Number(nums[0] ?? NaN), orders: Number(nums[1] ?? NaN) };
      lines.push(`/: data on screen in ${Date.now() - s} ms; stats packs=${stats.packs} orders=${stats.orders}`);
      if (!Number.isFinite(stats.packs) || !Number.isFinite(stats.orders)) {
        pass = false;
        lines.push("the stats strip printed no numbers above Packs listed and Orders");
      }
      if (home.includes("could not reach the network")) {
        pass = false;
        lines.push("/ says it could not reach the network");
      }
      await shot(page, "a-home");

      // the shop: a card per listing, and the card opens its pack page
      s = Date.now();
      await page.goto(BASE + "/shop", { waitUntil: "domcontentloaded" });
      if (stats.packs > 0) {
        await page.waitForFunction(() => document.querySelectorAll("article[aria-label]").length > 0, { timeout: READ_TIMEOUT, polling: 500 });
        const cards = await page.evaluate(() => Array.from(document.querySelectorAll("article[aria-label]")).map((a) => a.getAttribute("aria-label")));
        const shop = await bodyText(page);
        lines.push(`/shop: ${cards.length} cards in ${Date.now() - s} ms; first "${cards[0]}"; badges: ${(shop.match(/Not delivered yet|Demo|Closed/g) || []).join(",") || "none"}${shop.includes("Showing a snapshot") ? "; SNAPSHOT banner" : ""}`);
        await shot(page, "a-shop");
        // open the first card: the shop's only route to a pack page
        await page.evaluate(() => {
          const a = document.querySelector("article[aria-label]");
          const b = a && Array.from(a.querySelectorAll("button")).find((x) => /Buy|View/.test(x.innerText));
          if (b) b.click();
        });
        await page.waitForFunction(() => /\/pack\/L\d+/.test(location.pathname), { timeout: 30_000 });
        firstPack = page.url().match(/\/pack\/(L\d+)/)[1];
        const title = cards[0].split(" - ")[0];
        await waitText(page, title.slice(0, 30), READ_TIMEOUT);
        const pack = await bodyText(page);
        lines.push(`/pack/${firstPack}: opened from the shop card, shows "${title}"; hashes shown: ${(pack.match(/[0-9a-f]{64}/g) || []).length}; orders listed: ${(pack.match(/\bO\d+\b/g) || []).length}`);
        await shot(page, `a-pack-${firstPack}`);
        state.ids.firstPack = firstPack;
        saveState();
      } else {
        const shop = await bodyText(page);
        lines.push(`/shop: the register has no listings yet; the page says "${shop.slice(0, 120).replace(/\s+/g, " ")}"`);
      }

      // the ledger: every order on the register
      s = Date.now();
      await page.goto(BASE + "/ledger", { waitUntil: "domcontentloaded" });
      if (stats.orders > 0) {
        await waitText(page, /\bO\d+\b/, READ_TIMEOUT);
        const led = await bodyText(page);
        lines.push(`/ledger: ${(led.match(/\bO\d+\b/g) || []).length} rows in ${Date.now() - s} ms; verdicts: ${(led.match(/breaks|keeps|unclear/g) || []).join(",") || "none yet"}`);
      } else {
        lines.push("/ledger: the register has no orders yet");
      }
      await shot(page, "a-ledger");
    } catch (e) {
      pass = false;
      lines.push("FAILED: " + String(e.message || e).slice(0, 200));
      await shot(page, "a-FAIL");
    }
    record("a. /, /shop, /pack and /ledger render real data without a wallet", pass ? "PASS" : "FAIL", lines.join(" || "));
  }

  // ---- s. the site's own faucet (the buyer is funded the way a visitor is) ----
  if (process.env.SITE_FAUCET !== "0") {
    currentStep = "s";
    try {
      const f = await siteFaucet(page, "buyer", buyer);
      const ok = f.credited === 10n * GEN && f.checksummed;
      record(
        's. the site\'s "Get 10 test GEN" button credits a wallet that reports a lowercase address',
        ok ? "PASS" : "FAIL",
        `pressed in ${f.via}; the wallet reported ${f.addr} (lowercase: ${f.lower}); the site sent sim_fundAccount with ${f.sent.join(", ") || "nothing"} (checksummed: ${f.checksummed}); balance ${fmtGen(f.before)} to ${fmtGen(f.after)} (credited ${fmtGen(f.credited)}) in ${f.seconds.toFixed(0)} s; header ${f.headerBefore} GEN to ${f.headerAfter} GEN${f.pageError ? `; the page said "${f.pageError}"` : ""}`,
      );
    } catch (e) {
      await shot(page, "s-FAIL");
      record("s. the site's faucet button", "FAIL", String(e.message || e).slice(0, 300));
    }
    const held = await balance(buyer.address);
    if (held < 5n * GEN) {
      const after = await fund(buyer.address);
      observe(`the site's faucet left the buyer with ${fmtGen(held)}, so the harness funded it over RPC: ${fmtGen(after)}`);
    }
  }

  /** Lists the email demo pack if this register has none from an earlier step or run. */
  const ensureEmailPack = async () => {
    if (state.ids.emailPack) return state.ids.emailPack;
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await connectHeader(page, "seller");
    const r = await listDemo(page, { title: "Cold Email Templates, 6 templates", kind: "templates", price: "0.5 GEN" });
    state.ids.emailPack = r.id;
    state.ids.emailListTx = r.txHash;
    saveState();
    return r.id;
  };

  // ---- b. the seller lists a demo pack ----
  if (on("b")) {
    currentStep = "b";
    await cooldown();
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await waitText(page, "Connect wallet", 30_000).catch(() => {});
      const addr = await connectHeader(page, "seller");
      observe(`header after connect: "${(await headerText(page)).slice(-80)}"; wallet calls so far: ${JSON.stringify(await page.evaluate(() => window.__fakeWallet.calls))}`);
      await shot(page, "b-connected-seller");
      const r = await listDemo(page, { title: "Cold Email Templates, 6 templates", kind: "templates", price: "0.5 GEN" });
      state.ids.emailPack = r.id;
      state.ids.emailListTx = r.txHash;
      saveState();
      await page.goto(`${BASE}/pack/${r.id}`, { waitUntil: "domcontentloaded" });
      await waitText(page, "Cold Email Templates", READ_TIMEOUT);
      const packPage = await bodyText(page);
      const notDelivered = packPage.includes("Not delivered yet") || packPage.includes("has not uploaded the pack contents yet");
      await shot(page, `b-pack-${r.id}`);
      await page.goto(BASE + "/shop", { waitUntil: "domcontentloaded" });
      await waitText(page, "Cold Email Templates", READ_TIMEOUT);
      await shot(page, `b-shop-with-${r.id}`);
      record(
        `b. the seller connects and lists the email demo pack (${r.id}); a demo pack needs no upload`,
        r.live && r.signs === 0 && !notDelivered ? "PASS" : "FAIL",
        `connected as ${short(addr)}; list_pack tx ${r.txHash}; "Your pack is live." shown: ${r.live}; personal_sign calls for the listing: ${r.signs}; /pack/${r.id} says the text is missing: ${notDelivered}; status route: ${r.status.http} ${r.status.body}`,
      );
    } catch (e) {
      await shot(page, "b-FAIL");
      record("b. the seller lists the email demo pack", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- c. the buyer buys the email pack and disputes section 1 vs P2 (expected keeps) ----
  if (on("c")) {
    currentStep = "c";
    await cooldown();
    try {
      const packId = await ensureEmailPack();
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      const addr = await connectHeader(page, "buyer");
      observe(`header shows the buyer ${short(addr)}: "${(await headerText(page)).slice(-60)}"`);
      await shot(page, "c-connected-buyer");
      const b = await buy(page, packId, "0.5 GEN");
      state.ids.emailOrder = b.orderId;
      state.ids.emailOrderUrl = b.url;
      saveState();
      observe(`bought ${packId} to ${b.orderId} in ${b.seconds.toFixed(0)} s; landed on ${b.url}`);
      const pack = await loadPack(page);
      observe(`pack loaded: ${pack.counter} delivered as committed, ${pack.signs} signature(s), rows ${pack.rows.map((r) => `${r.n}:${rowState(r)}`).join(" ")}`);
      await shot(page, `c-order-${b.orderId}-pack`);
      const countdown = ((await bodyText(page)).match(/In escrow · ([^\n]+)/) || [])[1] || "?";
      observe(`dispute window countdown when the dispute starts: ${countdown}`);
      const d = await dispute(page, b.orderId, 1, 2, { bondExpected: bondFor("0.5"), snippet: "Quick question about your onboarding flow", sectionText: "" });
      const chain = d.judge?.hash ? await txInfo(d.judge.hash) : null;
      const ok =
        pack.signs === 1 &&
        pack.matches === 6 &&
        pack.mismatches === 0 &&
        d.bondShown === bondFor("0.5") &&
        d.judge?.kind === "applied" &&
        /Verdict: keeps/.test(d.verdictCard) &&
        d.judgedText &&
        d.judgeGone === true;
      record(
        `c. the buyer buys ${packId} (${b.orderId}), reads the pack after one signature, disputes section 1 vs P2 to a keeps verdict`,
        ok ? "PASS" : "FAIL",
        `buy ${b.seconds.toFixed(0)} s; pack: ${pack.counter} matched, ${pack.signs} personal_sign; dialog: "${d.dialog}"${d.confirm ? ` then "${d.confirm}"` : ""}; bond rail ${d.bond?.kind} (${d.bond?.seconds?.toFixed(0)} s); the card shows bond posted ${d.bondShown ?? "nothing"} (expected ${bondFor("0.5")}), still asking for a bond: ${d.bondToDispute}; judge rail ${d.judge?.kind} (${d.judge?.seconds?.toFixed(0)} s)${d.retried ? ", retried once" : ""}; votes "${d.votes}"; verdict card: "${d.verdictCard}"; judged text on the card: ${d.judgedText}; a second judge is impossible: ${d.judgeGone}; status "${d.status}"; paid to seller: ${d.paidSeller ?? "not shown"}; paid to buyer: ${d.paidBuyer ?? "not shown"}; chain says ${chain ? `${chain.status} ${JSON.stringify(chain.tally)} ${chain.exec} ${chain.msg.slice(0, 160)}` : "n/a"}`,
      );
    } catch (e) {
      await shot(page, "c-FAIL");
      record("c. the buyer buys the email pack and disputes section 1 vs P2", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- d. the breaks path on a freshly listed demo pack ----
  if (on("d") || on("d2")) {
    currentStep = "d";
    await cooldown();
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "seller");
      const r = await listDemo(page, { title: "Weeknight Vegetarian, 8 recipes", kind: "recipes", price: "1 GEN" });
      state.ids.vegPack = r.id;
      saveState();
      await connectHeader(page, "buyer");
      const b = await buy(page, r.id, "1 GEN");
      state.ids.vegOrder = b.orderId;
      saveState();
      const pack = await loadPack(page);
      observe(`pack loaded: ${pack.counter} delivered as committed, rows ${pack.rows.map((x) => `${x.n}:${rowState(x)}`).join(" ")}`);
      const balBefore = await balance(buyer.address);
      const d = await dispute(page, b.orderId, 5, 1, { bondExpected: bondFor("1"), snippet: "Fry 100 g bacon" });
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
        landed = t.includes("Refund landed") ? `"Refund landed in your wallet." after ${landedAfter.toFixed(0)} s` : t.includes("has not moved yet") ? `"Your balance has not moved yet…" after ${landedAfter.toFixed(0)} s` : seen ? "?" : `neither message within ${landedAfter.toFixed(0)} s (watching text present: ${t.includes("Watching")})`;
      }
      const balAfter = await balance(buyer.address);
      await shot(page, `d-order-${b.orderId}-refund`);
      const chain = d.judge?.hash ? await txInfo(d.judge.hash) : null;
      const ok = d.judge?.kind === "applied" && /Verdict: breaks/.test(d.verdictCard) && d.judgedText && d.bondShown === bondFor("1") && landed.startsWith('"Refund landed');
      record(
        `d. the buyer buys ${r.id} (${b.orderId}, the vegetarian demo pack), disputes section 5 vs P1 to a breaks verdict and waits for the refund`,
        ok ? "PASS" : "FAIL",
        `pack ${pack.counter} matched; bond ${d.bond?.kind} (${d.bond?.seconds?.toFixed(0)} s); the card shows bond posted ${d.bondShown ?? "nothing"} (expected ${bondFor("1")}); judge ${d.judge?.kind} (${d.judge?.seconds?.toFixed(0)} s)${d.retried ? ", retried once" : ""}; votes "${d.votes}"; verdict card: "${d.verdictCard}"; judged text on the card: ${d.judgedText}; paid to buyer: ${d.paidBuyer ?? "not shown"}; refund message: ${landed}; buyer balance ${fmtGen(balBefore)} to ${fmtGen(balAfter)} (rpc); chain: ${chain ? `${chain.status} ${JSON.stringify(chain.tally)} ${chain.exec} ${chain.msg.slice(0, 160)}` : "n/a"}`,
      );
    } catch (e) {
      await shot(page, "d-FAIL");
      record("d. the breaks path on a freshly listed demo pack", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- r. a section reported missing, revealed by the seller, then disputed ----
  if (on("r")) {
    currentStep = "r";
    await cooldown();
    const n = REVEAL_PACK.section;
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await connectHeader(page, "seller");
      const listed = await listCustom(page, REVEAL_PACK);
      state.ids.revealPack = listed.id;
      saveState();

      await connectHeader(page, "buyer");
      await page.goto(`${BASE}/pack/${listed.id}`, { waitUntil: "domcontentloaded" });
      await waitText(page, REVEAL_PACK.title, READ_TIMEOUT);
      const packPage = await bodyText(page);
      const warnsUndelivered = packPage.includes("Not delivered yet") || packPage.includes("has not uploaded the pack contents yet");
      const b = await buy(page, listed.id, `${REVEAL_PACK.price} GEN`);
      state.ids.revealOrder = b.orderId;
      saveState();
      const before = await loadPack(page);
      observe(`the un-uploaded pack on the order page: ${before.counter}; rows ${before.rows.map((x) => `${x.n}:${rowState(x)}`).join(" ")}; store said "${before.error || "nothing"}"`);
      await shot(page, `r-order-${b.orderId}-undelivered`);

      // the buyer reports one section missing
      await cooldown(12);
      await clickInSection(page, n, "Report it");
      const report = await waitRail(page, "Reporting the section missing");
      observe(`report_missing rail (${report.seconds.toFixed(0)} s): ${report.text}`);
      if (report.kind !== "applied") throw new Error(`report_missing ended ${report.kind}: ${report.text}`);
      const reported = await waitOrder(page, new RegExp(`Section ${n} reported missing`), 120_000);
      await shot(page, `r-order-${b.orderId}-missing`);
      if (!reported) throw new Error(`the order page never showed "Section ${n} reported missing"`);

      // the seller reveals the exact text on chain
      await connectHeader(page, "seller");
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitText(page, "Reveal on chain", READ_TIMEOUT);
      const box = await page.evaluateHandle(() => {
        const sec = Array.from(document.querySelectorAll("section")).find((s) => /reported missing/.test(s.innerText) && s.querySelector("textarea"));
        return sec ? sec.querySelector("textarea") : null;
      });
      const textarea = box.asElement();
      if (!textarea) throw new Error("the seller's reveal box has no text area");
      await fillHandle(textarea, REVEAL_PACK.sections[n - 1]);
      await click(page, "button", "Reveal on chain");
      const reveal = await waitRail(page, "Revealing the section");
      observe(`reveal rail (${reveal.seconds.toFixed(0)} s): ${reveal.text}`);
      if (reveal.kind !== "applied") throw new Error(`reveal ended ${reveal.kind}: ${reveal.text}`);
      const backInEscrow = await waitOrder(page, new RegExp(`Section ${n} was revealed on chain|In escrow`), 120_000);
      await shot(page, `r-order-${b.orderId}-revealed`);

      // the buyer sees the revealed section as delivered, and can dispute it
      await connectHeader(page, "buyer");
      await page.reload({ waitUntil: "domcontentloaded" });
      const after = await loadPack(page);
      const row = after.rows.find((x) => x.n === n) || { text: "", buttons: [], head: "" };
      const showsText = row.text.includes(REVEAL_PACK.snippet);
      const canDispute = row.buttons.some((x) => x.includes(DISPUTE_BUTTON));
      const reportGone = !row.buttons.some((x) => /Report it/.test(x));
      const othersReportable = after.rows.filter((x) => x.n !== n).every((x) => x.buttons.some((y) => /Report it/.test(y)));
      observe(`after the reveal: ${after.counter} delivered as committed; section ${n} head "${row.head}", buttons [${row.buttons.join(" | ")}]`);
      await shot(page, `r-order-${b.orderId}-after-reveal`);

      const phone = canDispute ? await dialogOnPhone(page, n) : { ok: false, note: "the revealed section offered no dispute button" };
      observe(`the promise dialog at 375 px: ${phone.ok ? "fits" : "does not fit"}; ${phone.note}`);

      const d = canDispute
        ? await dispute(page, b.orderId, n, REVEAL_PACK.promise, { bondExpected: bondFor(REVEAL_PACK.price), snippet: REVEAL_PACK.snippet, sectionText: REVEAL_PACK.sections[n - 1] })
        : null;
      const chain = d?.judge?.hash ? await txInfo(d.judge.hash) : null;
      const ok =
        warnsUndelivered &&
        before.undelivered === REVEAL_PACK.sections.length &&
        showsText &&
        canDispute &&
        reportGone &&
        othersReportable &&
        !d?.pasted &&
        d?.judge?.kind === "applied" &&
        /Verdict: breaks/.test(d?.verdictCard || "") &&
        d?.judgedText === true &&
        phone.ok;
      record(
        `r. ${listed.id} is listed without an upload, section ${n} is reported missing, revealed by the seller, then disputed (${b.orderId})`,
        ok ? "PASS" : "FAIL",
        `the pack page warns the text is missing: ${warnsUndelivered}; before the reveal ${before.counter} with ${before.undelivered} not delivered; report rail ${report.kind}; reveal rail ${reveal.kind}; back in escrow: ${backInEscrow}; after the reveal ${after.counter}, section ${n} shows its text: ${showsText}, offers a dispute: ${canDispute}, no longer offers a report: ${reportGone}, the other sections still do: ${othersReportable}; the harness had to paste the text: ${d?.pasted ?? "n/a"}; dialog at 375 px: ${phone.note}; bond posted ${d?.bondShown ?? "n/a"} (expected ${bondFor(REVEAL_PACK.price)}); judge ${d?.judge?.kind ?? "not asked"}; votes "${d?.votes ?? ""}"; verdict card: "${d?.verdictCard ?? ""}"; judged text on the card: ${d?.judgedText ?? "n/a"}; paid to buyer: ${d?.paidBuyer ?? "not shown"}; chain: ${chain ? `${chain.status} ${JSON.stringify(chain.tally)} ${chain.exec} ${chain.msg.slice(0, 160)}` : "n/a"}`,
      );
    } catch (e) {
      await shot(page, "r-FAIL");
      record("r. report missing, reveal, then dispute the revealed section", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- e. wrong chain, disconnect, faucet ----
  if (on("e")) {
    currentStep = "e";
    await cooldown();
    try {
      const packId = await ensureEmailPack();
      const priceLabel = "0.5 GEN";
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
      record("e1. the wrong-chain banner appears on 0x1, Pay refuses with a sentence, 0xf22f clears it", bannerUp && refusal && bannerGone && payBack ? "PASS" : "FAIL", `banner: "${banner}"; Pay button still shown on 0x1: ${payStill}; refusal text: "${refusal}"; banner gone after switch back: ${bannerGone}; Pay back: ${payBack}`);
    } catch (e) {
      await shot(page, "e1-FAIL");
      record("e1. the wrong-chain banner", "FAIL", String(e.message || e).slice(0, 300));
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
      record('e3. "Get 10 test GEN" in the wallet menu changes the shown balance', moved && credited === 10n * GEN && Number(after) > Number(before) ? "PASS" : "FAIL", `header ${before} GEN to ${after} GEN in ${secs} s; rpc ${fmtGen(rpcBefore)} to ${fmtGen(rpcAfter)} (credited ${fmtGen(credited)}); menu text after: "${menuErr}"`);
    } catch (e) {
      await shot(page, "e3-FAIL");
      record("e3. faucet", "FAIL", String(e.message || e).slice(0, 300));
    }
  }

  // ---- f. mobile ----
  if (on("f")) {
    currentStep = "f";
    await cooldown();
    const orderId = state.ids.revealOrder || state.ids.vegOrder || state.ids.emailOrder || "O1";
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
    record(`f. 375x812: /order/${orderId} and /sell have scrollWidth 375`, pass ? "PASS" : "FAIL", lines.join(" || "));
  }

  // ---- g. a visitor without a wallet on someone else's settled order ----
  if (on("g")) {
    currentStep = "g";
    await cooldown();
    const orderId = state.ids.emailOrder || state.ids.vegOrder || state.ids.revealOrder;
    try {
      if (!orderId) throw new Error("no settled order from this run or an earlier one on this register");
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
      const verdictCard = await v.evaluate(() => {
        const s = Array.from(document.querySelectorAll("section")).find((x) => x.innerText.includes("Verdict:"));
        return s ? s.innerText.replace(/\s+/g, " ").trim() : "";
      });
      const judgedText = /text the validators read/i.test(verdictCard);
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
      const settled = /Verdict:/.test(t);
      record(
        `g. a visitor without a wallet on /order/${orderId}`,
        packBlock.includes("Connect a wallet") && (!settled || judgedText) ? "PASS" : "FAIL",
        `header: ${headerNoWallet ? "Connect wallet" : "?"}; status shown: "${statusLine}"; the pack block says: "${packBlock.slice(0, 300)}"; the verdict card (no wallet): "${verdictCard.slice(0, 300)}"; it shows the judged text: ${settled ? judgedText : "the order is not settled"} || the seller (another connected wallet) sees: "${sellerBlock.slice(0, 300)}"`,
      );
    } catch (e) {
      await shot(page, "g-FAIL");
      record("g. a visitor without a wallet", "FAIL", String(e.message || e).slice(0, 300));
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
  const report = { finishedAt: new Date().toISOString(), contract: CONTRACT, addresses: state.addresses, ids: state.ids, results, notes, faucetCalls, consoleErrors, netFailures, walletLog: state.walletLog || null };
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
