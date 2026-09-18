"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, Loader2, Plus, Sparkles, Trash2, AlertTriangle } from "lucide-react";

import { TxRail } from "@/components/tx-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTx, failureOf, cleanWalletError } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { WalletGate } from "@/components/wallet-gate";
import { isMock, readListing } from "@/lib/chain";
import { manifestOf, sha256Hex, storageStatus, uploadMessage, uploadPack, type StorageStatus } from "@/lib/api";
import { mockStorePack } from "@/lib/chain-mock";
import { useRead, useSearchString } from "@/components/use-read";
import { demoKeys, demoSectionsFor } from "@/lib/demo-keys";
import { BlockSkeleton, ReadBlock } from "@/components/read-state";
import { DEMO_PACKS, PROMISE_TEMPLATES, WORLD_KNOWLEDGE_WORDS } from "@/lib/demo-packs";
import { gen, toAtto } from "@/lib/format";
import { cn } from "@/lib/utils";

// The contract's limits (docs/DESIGN.md §1). The form refuses what the contract would refuse.
const KINDS = ["recipes", "templates", "notes", "prompts", "guide", "other"] as const;
const MIN_TITLE = 3, MAX_TITLE = 60;
const MIN_PROMISES = 1, MAX_PROMISES = 6, MIN_PROMISE_CHARS = 8, MAX_PROMISE_CHARS = 160;
const MIN_SECTIONS = 1, MAX_SECTIONS = 12, MAX_SECTION_CHARS = 4000;
const MIN_PRICE = 10n ** 17n, MAX_PRICE = 1000n * 10n ** 18n;
const WINDOWS = [
  { value: "300", label: "5 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "259200", label: "3 days" },
  { value: "604800", label: "7 days" },
];

type Step = "form" | "listing" | "upload" | "done";

function StorageNote({ storage, isDemo }: { storage: StorageStatus | null; isDemo: boolean }) {
  if (isMock || !storage || storage.available || isDemo) return null;
  return (
    <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
      <AlertTriangle className="mr-1 inline size-3.5 text-gold" />
      This site has no storage for uploaded packs yet, so only the three demo packs can be sold here. Load one above, or
      wait for the site owner to connect a storage bucket.
    </p>
  );
}

export default function SellPage() {
  const w = useWallet();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<string>("recipes");
  const [promises, setPromises] = React.useState<string[]>([""]);
  const [sections, setSections] = React.useState<string[]>([""]);
  const [priceGen, setPriceGen] = React.useState("1");
  const [windowSeconds, setWindowSeconds] = React.useState("259200");
  const [hashes, setHashes] = React.useState<string[]>([]);
  const [step, setStep] = React.useState<Step>("form");
  const [listingId, setListingId] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [storage, setStorage] = React.useState<StorageStatus | null>(null);
  const [keys, setKeys] = React.useState<string[]>([]);
  const resumeId = new URLSearchParams(useSearchString()).get("upload") || "";

  React.useEffect(() => {
    let alive = true;
    void storageStatus().then((st) => alive && setStorage(st));
    void demoKeys().then((k) => alive && setKeys(k));
    return () => {
      alive = false;
    };
  }, []);
  const isDemo = keys.includes(hashes.join(","));
  const storageBlocked = !isMock && !!storage && !storage.available && !isDemo;
  // Read inside the tx callback below, which is created once.
  const isDemoRef = React.useRef(isDemo);
  React.useEffect(() => {
    isDemoRef.current = isDemo;
  }, [isDemo]);

  // live sha256 per section
  React.useEffect(() => {
    let alive = true;
    Promise.all(sections.map((s) => (s ? sha256Hex(s) : Promise.resolve("")))).then((h) => {
      if (alive) setHashes(h);
    });
    return () => {
      alive = false;
    };
  }, [sections]);

  const problems = React.useMemo(() => {
    const p: string[] = [];
    const t = title.trim();
    if (t.length < MIN_TITLE || t.length > MAX_TITLE) p.push(`Title: ${MIN_TITLE} to ${MAX_TITLE} characters.`);
    if (!KINDS.includes(kind as (typeof KINDS)[number])) p.push("Pick a kind.");
    const ps = promises.map((x) => x.trim());
    if (ps.length < MIN_PROMISES || ps.length > MAX_PROMISES) p.push(`Between ${MIN_PROMISES} and ${MAX_PROMISES} promises.`);
    ps.forEach((x, i) => {
      if (x.length < MIN_PROMISE_CHARS || x.length > MAX_PROMISE_CHARS) p.push(`Promise ${i + 1}: ${MIN_PROMISE_CHARS} to ${MAX_PROMISE_CHARS} characters.`);
    });
    if (sections.length < MIN_SECTIONS || sections.length > MAX_SECTIONS) p.push(`Between ${MIN_SECTIONS} and ${MAX_SECTIONS} sections.`);
    sections.forEach((s, i) => {
      if (!s.trim()) p.push(`Section ${i + 1} is empty.`);
      if (s.length > MAX_SECTION_CHARS) p.push(`Section ${i + 1} is over ${MAX_SECTION_CHARS} characters.`);
    });
    try {
      const atto = toAtto(priceGen);
      if (atto < MIN_PRICE) p.push("Price: at least 0.1 GEN.");
      if (atto > MAX_PRICE) p.push("Price: at most 1000 GEN.");
    } catch (e) {
      p.push(e instanceof Error ? e.message : "Enter a price.");
    }
    return p;
  }, [title, kind, promises, sections, priceGen]);

  const warnings = React.useMemo(
    () =>
      promises
        .map((x, i) => {
          const hits = WORLD_KNOWLEDGE_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(x));
          return hits.length ? `Promise ${i + 1} uses "${hits.join('", "')}": validators can only judge what the section text says, not what is true in the world.` : "";
        })
        .filter(Boolean),
    [promises],
  );

  const tx = useTx((s) => {
    const r = s.result;
    if (s.applied && r && r.ok === true && typeof r.listing === "string") {
      setListingId(r.listing);
      // A demo pack's text ships with the site: there is nothing to upload, the pack is live.
      setStep(isDemoRef.current ? "done" : "upload");
    }
  });

  const loadDemo = (i: number) => {
    const d = DEMO_PACKS[i];
    setTitle(d.title);
    setKind(d.kind);
    setPromises([...d.promises]);
    setSections([...d.sections]);
    setPriceGen(d.priceGen);
    setWindowSeconds(String(d.windowSeconds));
    setSubmitted(false);
  };

  const list = async () => {
    setSubmitted(true);
    if (problems.length || storageBlocked) return;
    setListingId(null);
    setUploadError("");
    setStep("listing");
    const hs = await Promise.all(sections.map(sha256Hex));
    setHashes(hs);
    const h = await tx.start("list_pack", [
      title.trim(),
      kind,
      JSON.stringify(promises.map((x) => x.trim())),
      JSON.stringify(hs),
      toAtto(priceGen).toString(),
      windowSeconds,
    ]);
    if (!h) setStep("form");
  };

  const upload = async () => {
    if (!listingId) return;
    setUploading(true);
    setUploadError("");
    try {
      if (isMock) {
        // no wallet in mock mode: the in-memory store takes the text straight away
        mockStorePack(listingId, sections);
        setStep("done");
        return;
      }
      const manifest = await manifestOf(hashes);
      const signature = await w.signMessage(uploadMessage(listingId, manifest));
      const r = await uploadPack(listingId, sections, w.address, signature);
      if (!r.ok) throw new Error(r.reason || "The upload was refused.");
      setStep("done");
    } catch (e) {
      setUploadError(cleanWalletError(e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  };

  const listingFailed = tx.final ? failureOf(tx.final) : "";
  const busy = step === "listing" && (tx.sending || (!!tx.hash && !tx.final));

  if (resumeId) return <ResumeUpload id={resumeId} storage={storage} />;

  return (
    <div className="container-site space-y-8 py-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Sell a pack</h1>
        <p className="text-muted-foreground">
          Write the sections, make promises about them, set a price. The hashes go on chain first; the text is uploaded after, signed by the same wallet.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void list();
          }}
        >
          <fieldset disabled={step !== "form"} className="space-y-8">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card p-3 text-sm">
              <Sparkles className="size-4 text-gold" />
              <span className="mr-2">Load a demo pack:</span>
              {DEMO_PACKS.map((d, i) => (
                <Button key={d.title} type="button" size="sm" variant="outline" onClick={() => loadDemo(i)} title={d.note}>
                  {i + 1}. {d.title.length > 28 ? d.title.slice(0, 28) + "…" : d.title}
                </Button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} placeholder="Weeknight Vegetarian, 8 recipes" />
                <p className="text-xs text-muted-foreground">{title.trim().length}/{MAX_TITLE}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kind">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(String(v))}>
                  <SelectTrigger id="kind" className="w-full">
                    <SelectValue>
                      <span className="capitalize">{kind}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        <span className="capitalize">{k}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Cover art only.</p>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Promises</h2>
                  <p className="text-xs text-muted-foreground">1 to 6, each {MIN_PROMISE_CHARS} to {MAX_PROMISE_CHARS} characters. Say what every section does, or what no section does.</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={promises.length >= MAX_PROMISES} onClick={() => setPromises((p) => [...p, ""])}>
                  <Plus /> Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROMISE_TEMPLATES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    onClick={() =>
                      setPromises((p) => {
                        const empty = p.findIndex((x) => !x.trim());
                        if (empty >= 0) return p.map((x, i) => (i === empty ? t : x));
                        return p.length < MAX_PROMISES ? [...p, t] : p;
                      })
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              <ol className="space-y-2">
                {promises.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 inline-flex h-5 shrink-0 items-center rounded-full bg-gold/15 px-2 font-mono text-[11px] font-semibold text-gold">P{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      <Input value={p} maxLength={MAX_PROMISE_CHARS} onChange={(e) => setPromises((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Every recipe is vegetarian: no meat, poultry or fish." aria-label={`Promise ${i + 1}`} />
                      <p className="text-[11px] text-muted-foreground">{p.trim().length}/{MAX_PROMISE_CHARS}</p>
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove promise ${i + 1}`} disabled={promises.length <= MIN_PROMISES} onClick={() => setPromises((ps) => ps.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
              {warnings.length ? (
                <ul className="space-y-1 rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
                  {warnings.map((m) => (
                    <li key={m} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" /> {m}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Sections</h2>
                  <p className="text-xs text-muted-foreground">1 to {MAX_SECTIONS}, up to {MAX_SECTION_CHARS} characters each. Every section is hashed as typed, byte for byte.</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={sections.length >= MAX_SECTIONS} onClick={() => setSections((s) => [...s, ""])}>
                  <Plus /> Add
                </Button>
              </div>
              <ol className="space-y-3">
                {sections.map((s, i) => (
                  <li key={i} className="rounded-xl border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label htmlFor={`section-${i}`}>Section {i + 1}</Label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[11px] tabular-nums", s.length > MAX_SECTION_CHARS ? "text-breaks" : "text-muted-foreground")}>{s.length}/{MAX_SECTION_CHARS}</span>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove section ${i + 1}`} disabled={sections.length <= MIN_SECTIONS} onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <Textarea id={`section-${i}`} value={s} rows={6} onChange={(e) => setSections((ss) => ss.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Recipe 1 — …" className="min-h-32 font-mono text-xs leading-relaxed" />
                    <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={hashes[i] || ""}>
                      sha256 {hashes[i] || "—"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Price (GEN)</Label>
                <Input id="price" inputMode="decimal" value={priceGen} onChange={(e) => setPriceGen(e.target.value)} placeholder="1" />
                <p className="text-xs text-muted-foreground">0.1 to 1000 GEN. A buyer disputing posts a 20% bond (at least 0.01 GEN).</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="window">Dispute window</Label>
                <Select value={windowSeconds} onValueChange={(v) => setWindowSeconds(String(v))}>
                  <SelectTrigger id="window" className="w-full">
                    <SelectValue>{WINDOWS.find((x) => x.value === windowSeconds)?.label ?? windowSeconds}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOWS.map((x) => (
                      <SelectItem key={x.value} value={x.value}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">After it closes with no dispute, anyone can release the price to you.</p>
              </div>
            </div>

            {submitted && problems.length ? (
              <ul className="space-y-1 rounded-lg border border-breaks/40 bg-breaks/10 p-3 text-xs">
                {problems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </fieldset>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Publish</h2>
            <ol className="mt-3 space-y-3 text-sm">
              <StepRow n={1} label="Sign list_pack" hint="Title, promises and hashes go on chain." state={step === "form" ? "todo" : step === "listing" ? "busy" : "done"} />
              <StepRow n={2} label={isDemo ? "Upload: nothing to do" : "Sign the upload"} hint={isDemo ? "A demo pack's text ships with the site, so buyers can read it as soon as it is listed." : "The section text goes to the delivery store, bound to the listing."} state={step === "upload" ? (uploading ? "busy" : "todo") : step === "done" ? "done" : "todo"} />
            </ol>

            <div className="mt-4 space-y-3">
              {step === "form" ? (
                <WalletGate action="list a pack">
                  <StorageNote storage={storage} isDemo={isDemo} />
                  <Button type="button" variant="cool" size="lg" className="w-full" onClick={() => void list()} disabled={busy || storageBlocked}>
                    List for {(() => {
                      try {
                        return gen(toAtto(priceGen));
                      } catch {
                        return "…";
                      }
                    })()}
                  </Button>
                  {submitted && problems.length ? <p className="text-xs text-breaks">Fix the {problems.length === 1 ? "problem" : "problems"} listed under the form.</p> : null}
                </WalletGate>
              ) : null}

              {tx.error ? <p className="text-sm text-breaks">{tx.error}</p> : null}
              {tx.hash && step !== "form" ? (
                <div className="space-y-2">
                  <TxRail hash={tx.hash} label="Listing the pack" onDone={tx.onDone} />
                  {listingFailed ? (
                    <>
                      <p className="text-sm text-breaks">{listingFailed}</p>
                      <Button type="button" variant="outline" className="w-full" onClick={() => { tx.reset(); setStep("form"); }}>
                        Back to the form
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {step === "upload" && listingId ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    Listed as <span className="font-mono text-primary">{listingId}</span>. Now upload the text so buyers can read it.
                  </p>
                  <Button type="button" variant="cool" size="lg" className="w-full" onClick={() => void upload()} disabled={uploading}>
                    {uploading ? <Loader2 className="animate-spin" /> : null} Sign and upload
                  </Button>
                  {uploadError ? <p className="text-sm text-breaks">{uploadError}</p> : null}
                </div>
              ) : null}

              {step === "done" && listingId ? (
                <div className="space-y-2 rounded-lg border border-keeps/40 bg-keeps/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Check className="size-4 text-keeps" /> Your pack is live.
                  </p>
                  {isDemo ? <p className="text-xs text-muted-foreground">Demo pack: its text ships with the site, so no upload was needed.</p> : null}
                  <Button asChild variant="cool" className="w-full">
                    <Link href={`/pack/${listingId}`}>
                      Open {listingId} <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">What a good promise looks like</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>It is about the section text itself, not the world.</li>
              <li>A reader can check it against one section alone.</li>
              <li>&quot;Every section states a total time, and it is under 30 minutes&quot; beats &quot;quick&quot;.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepRow({ n, label, hint, state }: { n: number; label: string; hint: string; state: "todo" | "busy" | "done" }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]", state === "done" && "border-keeps bg-keeps/15 text-keeps", state === "busy" && "border-primary text-primary")}>
        {state === "done" ? <Check className="size-3" /> : state === "busy" ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-2 fill-current opacity-40" />}
      </span>
      <div>
        <p className={cn("font-medium", state === "todo" && "text-muted-foreground")}>
          {n}. {label}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

/**
 * /sell?upload=L7 — the text of an already-listed pack never reached the store (a failed or
 * skipped upload). The seller pastes the sections again; each one is hashed live and compared
 * with what the listing committed, and the upload is signed only when every section matches.
 */
function ResumeUpload({ id, storage }: { id: string; storage: StorageStatus | null }) {
  const w = useWallet();
  const state = useRead(() => readListing(id), [id]);
  const listing = state.data;
  const [sections, setSections] = React.useState<string[] | null>(null);
  const [hashes, setHashes] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  // First fill: the demo text when the hashes are a demo pack's, blanks otherwise.
  React.useEffect(() => {
    if (!listing || sections !== null) return;
    let alive = true;
    void demoSectionsFor(listing.hashes).then((demo) => {
      if (alive) setSections(demo ?? listing.hashes.map(() => ""));
    });
    return () => {
      alive = false;
    };
  }, [listing, sections]);

  React.useEffect(() => {
    if (!sections) return;
    let alive = true;
    Promise.all(sections.map((t) => (t ? sha256Hex(t) : Promise.resolve("")))).then((h) => alive && setHashes(h));
    return () => {
      alive = false;
    };
  }, [sections]);

  const target = (listing?.hashes ?? []).map((h) => h.toLowerCase());
  const matches = target.map((h, i) => !!hashes[i] && hashes[i] === h);
  const allMatch = target.length > 0 && matches.every(Boolean);
  const isDemo = allMatch && !!sections && DEMO_PACKS.some((p) => p.sections.length === sections.length && p.sections.every((t, i) => t === sections[i]));
  const blocked = !isMock && !!storage && !storage.available && !isDemo;
  const mine = !!listing && !!w.address && listing.seller.toLowerCase() === w.address.toLowerCase();

  const upload = async () => {
    if (!listing || !sections || !allMatch) return;
    setUploading(true);
    setError("");
    try {
      if (isMock) {
        mockStorePack(listing.id, sections);
        setDone(true);
        return;
      }
      const signature = await w.signMessage(uploadMessage(listing.id, await manifestOf(target)));
      const r = await uploadPack(listing.id, sections, w.address, signature);
      if (!r.ok) throw new Error(r.reason || "The upload was refused.");
      setDone(true);
    } catch (e) {
      setError(cleanWalletError(e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container-site space-y-8 py-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Upload the text of {id}</h1>
        <p className="text-muted-foreground">
          The listing is on chain; buyers need its text. Paste every section exactly as it was hashed, then sign the upload.
        </p>
      </div>
      <ReadBlock state={state} skeleton={<BlockSkeleton lines={4} />}>
        {(l) =>
          !l ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">There is no listing named {id} on this register.</p>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <div className="rounded-xl border bg-card p-4 text-sm">
                  <p className="font-medium">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.id} · {gen(l.priceAtto)} · {l.hashes.length} sections · seller {l.seller.slice(0, 6)}…{l.seller.slice(-4)}
                  </p>
                  <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {l.promises.map((p, i) => (
                      <li key={i}>P{i + 1} · {p}</li>
                    ))}
                  </ol>
                </div>
                <ol className="space-y-3">
                  {(sections ?? []).map((t, i) => (
                    <li key={i} className="rounded-xl border bg-card p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Label htmlFor={`resume-${i}`}>Section {i + 1}</Label>
                        <span className={cn("text-[11px]", matches[i] ? "text-keeps" : t ? "text-breaks" : "text-muted-foreground")}>
                          {matches[i] ? "matches the listing" : t ? "does not match the committed hash" : "empty"}
                        </span>
                      </div>
                      <Textarea id={`resume-${i}`} value={t} rows={6} onChange={(e) => setSections((ss) => (ss ?? []).map((x, j) => (j === i ? e.target.value : x)))} className="min-h-32 font-mono text-xs leading-relaxed" disabled={done} />
                      <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={target[i]}>committed {target[i]}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                <div className="space-y-3 rounded-2xl border bg-card p-5">
                  <h2 className="font-semibold">Upload</h2>
                  <p className="text-xs text-muted-foreground">
                    {allMatch ? "Every section matches. Sign once and buyers can read the pack." : `${matches.filter(Boolean).length} of ${target.length} sections match so far.`}
                  </p>
                  {!isMock && listing && w.address && !mine ? (
                    <p className="text-xs text-breaks">Only the wallet that listed this pack can upload its text.</p>
                  ) : null}
                  <StorageNote storage={storage} isDemo={isDemo} />
                  {done ? (
                    <div className="space-y-2 rounded-lg border border-keeps/40 bg-keeps/10 p-3 text-sm">
                      <p className="flex items-center gap-2 font-medium">
                        <Check className="size-4 text-keeps" /> The text is uploaded. Buyers can read {l.id} now.
                      </p>
                      <Button asChild variant="cool" className="w-full">
                        <Link href={`/pack/${l.id}`}>
                          Open {l.id} <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <WalletGate action="upload the text">
                      <Button type="button" variant="cool" size="lg" className="w-full" onClick={() => void upload()} disabled={!allMatch || uploading || blocked || (!isMock && !mine)}>
                        {uploading ? <Loader2 className="animate-spin" /> : null} Sign and upload
                      </Button>
                    </WalletGate>
                  )}
                  {error ? <p className="text-sm text-breaks">{error}</p> : null}
                </div>
              </aside>
            </div>
          )
        }
      </ReadBlock>
    </div>
  );
}
