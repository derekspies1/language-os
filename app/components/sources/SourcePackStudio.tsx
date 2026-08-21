"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLearnerMemory } from "../../lib/learner-memory/use-learner-memory";
import { ingestSourcePackAnalysis } from "../../lib/learner-memory/repeat-integration";
import { SongAnalysisResponseSchema } from "../../lib/song-analysis/contracts";
import {
  createSourcePack,
  getSourcePackDraftError,
  PENDING_SOURCE_PACK_KEY,
  SourcePackSchema,
  sourcePackAnalysisRequest,
  type SourcePack,
} from "../../lib/source-packs/contracts";
import { deriveSourcePackProgress, itemIdsForSourcePack } from "../../lib/source-packs/progress";
import { BrowserSourcePackRepository } from "../../lib/source-packs/repository";

export function SourcePackStudio() {
  const memory = useLearnerMemory();
  const repositoryRef = useRef<BrowserSourcePackRepository | null>(null);
  const ingestedSignature = useRef("");
  const [packs, setPacks] = useState<SourcePack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", context: "", koreanText: "" });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const active = packs.find((pack) => pack.id === activeId) ?? null;

  useEffect(() => {
    const repository = new BrowserSourcePackRepository(window.localStorage);
    repositoryRef.current = repository;
    void repository.load().then((result) => {
      setPacks(result.packs);
      setActiveId(result.packs[0]?.id ?? null);
      setWarning(result.warning);
      setHydrated(true);
    }).catch(() => {
      setWarning("Source Packs could not be reopened. Learner memory remains available.");
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!memory.hydrated) return;
    const ready = packs.filter((pack) => pack.analysis && pack.analysisMeta);
    const signature = ready.map((pack) => `${pack.id}:${pack.updatedAt}`).join("|");
    if (!signature || signature === ingestedSignature.current) return;
    ingestedSignature.current = signature;
    const next = ready.reduce((record, pack) => ingestSourcePackAnalysis(record, {
      sessionId: pack.id,
      title: pack.title,
      artist: pack.context,
      albumOrSource: "Learner-pasted Source Pack",
      startedAt: pack.createdAt,
      analysis: pack.analysis!,
      analysisMeta: pack.analysisMeta!,
    }), memory.record);
    memory.replaceRecord(next);
  }, [memory, packs]);

  async function save(pack: SourcePack) {
    const validated = SourcePackSchema.parse(pack);
    setPacks((current) => [validated, ...current.filter((candidate) => candidate.id !== validated.id)]);
    await repositoryRef.current?.save(validated);
    return validated;
  }

  async function analyze(pack: SourcePack) {
    if (requestingId) return;
    setRequestingId(pack.id);
    const loading = await save({ ...pack, analysisStatus: "loading", analysisError: null, updatedAt: new Date().toISOString() });
    try {
      const response = await fetch("/api/song-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourcePackAnalysisRequest(loading)),
      });
      const json: unknown = await response.json();
      if (!response.ok) throw new Error(typeof json === "object" && json && "error" in json ? String(json.error) : "Source analysis failed.");
      const parsed = SongAnalysisResponseSchema.parse(json);
      const ready = await save({
        ...loading,
        analysis: parsed.data,
        analysisMeta: parsed.meta,
        analysisStatus: "ready",
        analysisError: parsed.meta.error,
        updatedAt: new Date().toISOString(),
      });
      memory.replaceRecord(ingestSourcePackAnalysis(memory.record, {
        sessionId: ready.id,
        title: ready.title,
        artist: ready.context,
        albumOrSource: "Learner-pasted Source Pack",
        startedAt: ready.createdAt,
        analysis: ready.analysis!,
        analysisMeta: ready.analysisMeta!,
      }));
    } catch (caught) {
      await save({ ...loading, analysisStatus: "error", analysisError: caught instanceof Error ? caught.message : "Source analysis failed.", updatedAt: new Date().toISOString() });
    } finally {
      setRequestingId(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const error = getSourcePackDraftError(draft);
    if (error) { setDraftError(error); return; }
    const pack = createSourcePack(draft);
    setDraftError(null);
    setActiveId(pack.id);
    setDraft({ title: "", context: "", koreanText: "" });
    await save(pack);
    await analyze(pack);
  }

  function learn(pack: SourcePack) {
    window.localStorage.setItem(PENDING_SOURCE_PACK_KEY, pack.id);
    window.location.assign("/exposure");
  }

  if (!hydrated || !memory.hydrated) return <SourceShell><div className="sources-loading"><i /><p>Opening your source shelf…</p></div></SourceShell>;

  return <SourceShell>
    {(warning || memory.warning) && <div className="sources-warning"><span>{warning ?? memory.warning}</span><button type="button" onClick={() => { setWarning(null); memory.dismissWarning(); }}>Dismiss</button></div>}
    <section className="sources-grid">
      <aside className="source-shelf"><header><span>YOUR MAGNETIC MATERIAL</span><h1>Source Packs</h1><p>Paste Korean you already care about. Language OS maps it into the same learner memory used everywhere else.</p></header><button className={!active ? "active" : ""} type="button" onClick={() => setActiveId(null)}>＋ New source</button>{packs.map((pack) => <button className={activeId === pack.id ? "active" : ""} type="button" key={pack.id} onClick={() => setActiveId(pack.id)}><b>{pack.title}</b><small>{pack.context || "Personal source"}</small><i data-status={pack.analysisStatus}>{pack.analysisStatus}</i></button>)}</aside>
      {!active ? <SourceImport draft={draft} setDraft={setDraft} error={draftError} submit={create} /> : <SourceDetail pack={active} record={memory.record} requesting={requestingId === active.id} analyze={() => analyze(active)} learn={() => learn(active)} />}
    </section>
  </SourceShell>;
}

function SourceShell({ children }: { children: React.ReactNode }) {
  return <main className="sources-shell"><header className="sources-topbar"><Link href="/" className="sources-brand"><span>L/</span><div><b>LANGUAGE OS</b><small>SOURCE PACKS</small></div></Link><nav><Link href="/song-study">Song Study</Link><Link href="/exposure">Daily exposure</Link><Link href="/learn">Learning universe</Link><Link href="/repeat">Repeat Studio</Link><span>LEARNER-SUPPLIED · LOCAL</span></nav></header>{children}</main>;
}

function SourceImport({ draft, setDraft, error, submit }: { draft: { title: string; context: string; koreanText: string }; setDraft: (draft: { title: string; context: string; koreanText: string }) => void; error: string | null; submit: (event: FormEvent) => void }) {
  return <section className="source-import"><p className="source-kicker">CREATE A LEARNING SOURCE</p><h1>Start with what<br />won’t leave your head.</h1><p>Bring Korean lyrics or text you already have. Nothing is scraped or retrieved for you.</p><form onSubmit={submit}><label htmlFor="source-title">SOURCE TITLE</label><input id="source-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="The song currently stuck in my head" autoFocus /><label htmlFor="source-context">ARTIST OR CONTEXT · OPTIONAL</label><input id="source-context" value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} placeholder="Artist, album, scene, or why it matters" /><label htmlFor="source-text">PASTE KOREAN TEXT</label><textarea id="source-text" value={draft.koreanText} onChange={(event) => setDraft({ ...draft, koreanText: event.target.value })} placeholder={"오늘도 네 생각이 나\n이 노래를 다시 들어"} rows={12} />{error && <p className="source-form-error" role="alert">{error}</p>}<button type="submit">Analyze this source <span>→</span></button></form><small>You are responsible for the text you paste. Language OS stores it only in this browser.</small></section>;
}

function SourceDetail({ pack, record, requesting, analyze, learn }: { pack: SourcePack; record: ReturnType<typeof useLearnerMemory>["record"]; requesting: boolean; analyze: () => void; learn: () => void }) {
  const progress = useMemo(() => deriveSourcePackProgress(record, pack), [pack, record]);
  const sourceItemIds = useMemo(() => new Set(itemIdsForSourcePack(record, pack.id)), [pack.id, record]);
  const items = record.items.filter((item) => sourceItemIds.has(item.id)).slice(0, 18);
  return <section className="source-detail"><header><p className="source-kicker">{pack.context || "PERSONAL SOURCE"}</p><h1>{pack.title}</h1><p>{pack.lines.length} Korean line{pack.lines.length === 1 ? "" : "s"} · supplied by you · {pack.analysisMeta?.demoMode ? "safe local structure" : pack.analysisMeta ? "live structured analysis" : "awaiting analysis"}</p><div>{pack.analysisStatus === "ready" ? <button className="source-learn" type="button" onClick={learn}>Learn from this <span>→</span></button> : <button className="source-learn" type="button" onClick={analyze} disabled={requesting}>{requesting ? "Analyzing…" : pack.analysisStatus === "error" ? "Retry analysis" : "Analyze source"}</button>}<Link href="/repeat">Open deeper Repeat Studio</Link></div>{pack.analysisError && <small className="source-analysis-note">{pack.analysisError}</small>}</header>
    <div className="source-progress"><span>THIS SOURCE IS BECOMING LESS OPAQUE</span><div><Metric value={progress.encountered} label="items mapped" /><Metric value={progress.recognizedReading} label="recognizable in reading" /><Metric value={progress.recognizedListening} label="recognizable by sound" /><Metric value={progress.weakOrUnexplored} label="weak across a modality" /><Metric value={progress.phrasesUnderstandable} label="phrases becoming clear" /><Metric value={progress.recentlyStrengthened} label="recently strengthened" /></div><small>Separate evidence, not a mastery percentage.</small></div>
    <section className="source-map"><header><span>LEARNABLE STRUCTURE</span><p>{items.length ? `${items.length} source-linked items currently visible` : "Analysis will place source-linked items here."}</p></header>{items.length ? <div>{items.map((item) => <article key={item.id}><b lang="ko">{item.canonicalForm}</b><p>{item.senses[0]?.gloss ?? "Meaning not yet described"}</p><small>{item.type.replaceAll("_", " ")}</small></article>)}</div> : <p className="source-empty">{pack.analysisMeta?.demoMode ? "Local mode preserves each Korean line as a learnable phrase without inventing translations. Configure the existing live analyzer for detailed vocabulary and meanings." : "Analyze this source to extract validated words, expressions, forms, and phrase units."}</p>}</section>
    <section className="source-lines"><span>ORIGINAL SOURCE · PRESERVED</span>{pack.lines.map((line) => <p lang="ko" key={line.id}><small>{line.id.replace("line-", "")}</small>{line.text}</p>)}</section>
  </section>;
}

function Metric({ value, label }: { value: number; label: string }) { return <div><b>{value}</b><small>{label}</small></div>; }
