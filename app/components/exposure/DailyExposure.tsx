"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LEARNER_STATE_LABELS } from "../../lib/learner-memory/contracts";
import type { CloseLoopOutcome, InitialExposureResponse } from "../../lib/exposure/contracts";
import { useDailyExposure } from "../../lib/exposure/use-daily-exposure";
import {
  PENDING_SOURCE_PACK_KEY,
  type SourcePack,
} from "../../lib/source-packs/contracts";
import { BrowserSourcePackRepository } from "../../lib/source-packs/repository";
import type { PronunciationLayer } from "../../lib/pronunciation/contracts";
import { PronunciationButton } from "./PronunciationButton";

const starterIntents = ["K-pop YouTube reactions", "Korean I might hear while watching LCK", "Music and performances"];

export function DailyExposure() {
  const exposure = useDailyExposure();
  const [intent, setIntent] = useState("");
  const [sourcePacks, setSourcePacks] = useState<SourcePack[]>([]);
  const pendingStarted = useRef(false);
  const sourcesLoaded = useRef(false);
  const session = exposure.session;
  const item = exposure.item;

  useEffect(() => {
    if (!exposure.hydrated || sourcesLoaded.current) return;
    sourcesLoaded.current = true;
    const repository = new BrowserSourcePackRepository(window.localStorage);
    void repository.load().then(({ packs }) => {
      const ready = packs.filter((pack) => pack.analysisStatus === "ready" && pack.analysis && pack.analysisMeta);
      setSourcePacks(ready);
      const pendingId = window.localStorage.getItem(PENDING_SOURCE_PACK_KEY);
      const pending = ready.find((pack) => pack.id === pendingId);
      if (pending) {
        pendingStarted.current = true;
        window.localStorage.removeItem(PENDING_SOURCE_PACK_KEY);
        exposure.startFromSource(pending);
      }
    });
  }, [exposure]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (!session || !item) return;
      if (session.status === "exposing" && !item.initialResponse) {
        if ((event.key === " " || event.key.toLowerCase() === "r") && item.initialModality === "reading") { event.preventDefault(); exposure.reveal(); }
        if (event.key === "1" || event.key.toLowerCase() === "k") exposure.respond("know");
        if (event.key === "2" || event.key.toLowerCase() === "f") exposure.respond("familiar");
        if (event.key === "3" || event.key.toLowerCase() === "n") exposure.respond("new");
      }
      if (session.status === "closing") {
        if (event.key === "1" || event.key.toLowerCase() === "g") exposure.closeItem("got_it");
        if (event.key === "2" || event.key.toLowerCase() === "a") exposure.closeItem("almost");
        if (event.key === "3" || event.key.toLowerCase() === "x") exposure.closeItem("didnt_stick");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exposure, item, session]);

  function start(event: FormEvent) {
    event.preventDefault();
    exposure.start(intent || "Give me Korean");
  }

  if (!exposure.hydrated) return <ExposureShell><div className="exposure-loading"><i /><p>Opening today’s neighborhood…</p></div></ExposureShell>;

  return <ExposureShell>
    {exposure.warning && <div className="exposure-warning"><p>{exposure.warning}</p><button type="button" onClick={exposure.dismissWarning}>Dismiss</button></div>}
    {!session && <StartExposure intent={intent} setIntent={setIntent} start={start} onQuickStart={exposure.start} sourcePacks={sourcePacks} onSource={exposure.startFromSource} />}
    {session?.status === "exposing" && item && <WordExposure session={session} item={item} index={exposure.currentIndex} onReveal={exposure.reveal} onRevealKorean={exposure.revealKorean} onRespond={exposure.respond} onContinue={exposure.continueInitial} onAudio={exposure.audioPlayed} />}
    {session?.status === "awaiting_close" && <OpenLoop session={session} onClose={exposure.beginClose} />}
    {session?.status === "closing" && item && <CloseLoop session={session} item={item} index={exposure.currentIndex} onRespond={exposure.closeItem} onAudio={exposure.audioPlayed} />}
    {session?.status === "complete" && exposure.summary && <ExposureComplete session={session} summary={exposure.summary} />}
  </ExposureShell>;
}

function ExposureShell({ children }: { children: React.ReactNode }) {
  return <main className="exposure-shell"><header className="exposure-topbar"><Link href="/" className="exposure-brand"><span>L/</span><div><b>LANGUAGE OS</b><small>DAILY EXPOSURE</small></div></Link><nav><Link href="/song-study">Song Study</Link><Link href="/sources">Source Packs</Link><Link href="/learn">Learning universe</Link><Link href="/repeat">Repeat Studio</Link><span>LOCAL MEMORY · OPEN LOOP</span></nav></header><section className="exposure-stage">{children}</section><footer><span>SOURCE → SEE / HEAR → EVIDENCE</span><span>NO STREAKS · NO MASTERY SCORE</span></footer></main>;
}

function StartExposure({ intent, setIntent, start, onQuickStart, sourcePacks, onSource }: { intent: string; setIntent: (value: string) => void; start: (event: FormEvent) => void; onQuickStart: (intent: string) => void; sourcePacks: SourcePack[]; onSource: (pack: SourcePack) => void }) {
  return <div className="exposure-start"><p className="exposure-kicker">TODAY’S NEIGHBORHOOD</p><h1>What Korean do you<br />want to illuminate?</h1><p className="exposure-intro">A magnetic source can become today’s whole pool. Or begin with a lightweight intention and twelve useful words.</p>{sourcePacks.length > 0 && <section className="source-starts"><span>LEARN FROM A SOURCE · NO GENERIC ITEMS MIXED IN</span>{sourcePacks.map((pack) => <button type="button" key={pack.id} onClick={() => onSource(pack)}><div><b>{pack.title}</b><small>{pack.context || `${pack.lines.length} Korean lines`}</small></div><i>SEE + HEAR →</i></button>)}</section>}<Link className="bring-source" href="/sources">＋ Paste the song or Korean text currently stuck in your head</Link><form onSubmit={start}><label htmlFor="exposure-intent">OR USE A LIGHTWEIGHT INTENTION</label><input id="exposure-intent" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Korean I might hear while watching LCK" /><button className="exposure-primary" type="submit">Shape today’s set <span>→</span></button></form><div className="quick-intents"><span>BEGIN IMMEDIATELY</span><button className="instant-button" type="button" onClick={() => onQuickStart("Give me Korean")}>Give me Korean <b>12 words</b></button>{starterIntents.map((value) => <button type="button" key={value} onClick={() => setIntent(value)}>{value}</button>)}</div><aside><span>HOW SOURCE MODE WORKS</span><p>Items stay inside the selected source. Language OS alternates reading-first and listening-first contact based on which modality needs evidence.</p></aside></div>;
}

type ExposureHook = ReturnType<typeof useDailyExposure>;
type Session = NonNullable<ExposureHook["session"]>;
type Item = NonNullable<ExposureHook["item"]>;

function WordExposure({ session, item, index, onReveal, onRevealKorean, onRespond, onContinue, onAudio }: { session: Session; item: Item; index: number; onReveal: () => void; onRevealKorean: () => void; onRespond: (value: InitialExposureResponse) => void; onContinue: () => void; onAudio: (layer: PronunciationLayer) => void }) {
  const listeningFirst = item.initialModality === "listening";
  const koreanVisible = !listeningFirst || item.koreanRevealed;
  const responseCaptured = Boolean(item.initialResponse);
  return <div className="word-room"><Progress current={index + 1} total={session.items.length} label={listeningFirst ? "LISTENING-FIRST" : "READING-FIRST"} /><div className="interest-thread"><span>{item.source ? "SOURCE" : "INTENT"}</span><p>{item.source?.title ?? session.intent.text}</p></div><article className={`word-card ${!koreanVisible ? "audio-first-card" : ""}`}><p className="word-state">{LEARNER_STATE_LABELS[item.learnerState]} · {reasonLabel(item.reason)}</p>{koreanVisible ? <><h1 lang="ko">{item.targetText}</h1><AudioLayers item={item} onAudio={onAudio} compact={!listeningFirst} />{item.meaningRevealed ? <Meaning item={item} /> : <button className="reveal-button" type="button" onClick={onReveal}>Reveal meaning <kbd>Space</kbd></button>}</> : <><div className="audio-first-orb"><i /><span>KOREAN HIDDEN</span></div>{item.audio && <PronunciationButton text={item.audio.word} layer="word" label="Play Korean" onPlayed={onAudio} />}<small className="audio-first-note">Listen before seeing the written form.</small></>}</article>{!responseCaptured ? <RecognitionQuestion modality={item.initialModality} onRespond={onRespond} /> : listeningFirst && !item.koreanRevealed ? <div className="post-listen"><p>Your sound response is saved separately from reading.</p><button className="exposure-primary" type="button" onClick={onRevealKorean}>Reveal the Korean <span>→</span></button></div> : listeningFirst ? <div className="post-listen"><p>The written form is now contact—not proof you could read it before.</p><button className="exposure-primary" type="button" onClick={onContinue}>Continue <span>→</span></button></div> : null}</div>;
}

function RecognitionQuestion({ modality, onRespond }: { modality: "reading" | "listening"; onRespond: (value: InitialExposureResponse) => void }) {
  const listening = modality === "listening";
  return <div className="exposure-question"><p>{listening ? "What was available by sound?" : "What is available on the page?"}</p><div className="response-grid"><ResponseButton label={listening ? "Recognized it" : "Know"} detail={listening ? "The sound resolved" : "Meaning is available"} shortcut="1" onClick={() => onRespond("know")} /><ResponseButton label={listening ? "Familiar sound" : "Familiar"} detail={listening ? "I have heard this shape" : "I recognize it"} shortcut="2" onClick={() => onRespond("familiar")} /><ResponseButton label={listening ? "Didn’t catch it" : "Not sure / New"} detail={listening ? "The sound disappeared" : "Little or nothing yet"} shortcut="3" onClick={() => onRespond("new")} /></div><small>Your response creates {listening ? "listening" : "reading"} evidence only. It is not a grade.</small></div>;
}

function AudioLayers({ item, onAudio, compact }: { item: Item; onAudio: (layer: PronunciationLayer) => void; compact?: boolean }) {
  if (!item.audio) return null;
  return <div className={`audio-layers ${compact ? "compact" : ""}`}><PronunciationButton text={item.audio.word} layer="word" label="Word" onPlayed={onAudio} />{item.audio.phrase !== item.audio.word && <PronunciationButton text={item.audio.phrase} layer="phrase" label="Tiny phrase" onPlayed={onAudio} />}{item.audio.microContext && <PronunciationButton text={item.audio.microContext} layer="micro_context" label="Source line" onPlayed={onAudio} />}</div>;
}

function Meaning({ item }: { item: Item }) { return <div className="meaning-reveal"><strong>{item.naturalMeaning}</strong><p>{item.usageClue}</p>{item.source && <p lang="ko" className="source-excerpt">{item.source.sourceExcerpt}</p>}<small>{item.reasonText}</small></div>; }

function OpenLoop({ session, onClose }: { session: Session; onClose: () => void }) {
  const known = session.items.filter((item) => item.initialResponse === "know").length;
  const familiar = session.items.filter((item) => item.initialResponse === "familiar").length;
  const listening = session.items.filter((item) => item.initialModality === "listening").length;
  return <div className="open-loop"><p className="exposure-kicker">EXPOSURE COMPLETE · LOOP OPEN</p><h1>{session.items.length} exposed today.<br /><span>{session.items.length} still open.</span></h1><p>Seeing and hearing remain separate evidence. Leave now and return later, or close the loop when you’re ready to see what survived.</p><div className="open-loop-stats"><div><strong>{known}</strong><span>recognized initially</span></div><div><strong>{familiar}</strong><span>felt familiar</span></div><div><strong>{listening}</strong><span>listening-first</span></div></div><button className="exposure-primary" type="button" onClick={onClose}>Close today’s loop <span>→</span></button><small>This set is saved in this browser. Closing it adds later evidence without erasing the first response.</small></div>;
}

function CloseLoop({ session, item, index, onRespond, onAudio }: { session: Session; item: Item; index: number; onRespond: (value: CloseLoopOutcome) => void; onAudio: (layer: PronunciationLayer) => void }) {
  const listening = item.initialModality === "listening";
  return <div className="word-room close-room"><Progress current={index + 1} total={session.items.length} label={`LATER ${listening ? "LISTENING" : "READING"} CHECK`} /><p className="close-instruction">Let the meaning come to mind before choosing.</p><article className={`word-card ${listening ? "audio-first-card" : ""}`}><p className="word-state">FIRST CONTACT · {initialLabel(item.initialResponse)}</p>{listening ? <>{item.audio && <PronunciationButton text={item.audio.word} layer="word" label="Play Korean" onPlayed={onAudio} />}<small className="audio-first-note">The written form stays hidden during this check.</small></> : <h1 lang="ko">{item.targetText}</h1>}</article><div className="exposure-question"><p>What survived without the answer?</p><div className="response-grid"><ResponseButton label="Got it" detail="The meaning came back" shortcut="1" onClick={() => onRespond("got_it")} /><ResponseButton label="Almost" detail={listening ? "Sound recognition, not retrieval" : "Reading recognition, not retrieval"} shortcut="2" onClick={() => onRespond("almost")} /><ResponseButton label="Didn’t stick" detail="Needs another contact" shortcut="3" onClick={() => onRespond("didnt_stick")} /></div><small>The answer appears in your summary after the loop closes.</small></div></div>;
}

function ExposureComplete({ session, summary }: { session: Session; summary: NonNullable<ExposureHook["summary"]> }) {
  const changes = useMemo(() => session.items.map((item) => {
    const after = item.stateAfter ?? item.learnerState;
    if (item.closeOutcome === "didnt_stick") return <p key={item.id}><b lang="ko">{item.targetText}</b><span>{LEARNER_STATE_LABELS[after]}, but retrieval did not stick—another {item.initialModality} exposure is useful.</span></p>;
    if (after !== item.learnerState) return <p key={item.id}><b lang="ko">{item.targetText}</b><span>moved from {LEARNER_STATE_LABELS[item.learnerState]} → {LEARNER_STATE_LABELS[after]}.</span></p>;
    return <p key={item.id}><b lang="ko">{item.targetText}</b><span>strengthened with later {item.closeOutcome === "got_it" ? "retrieval" : `${item.initialModality} recognition`}.</span></p>;
  }).slice(0, 5), [session]);
  const source = session.items.find((item) => item.source)?.source;
  return <div className="exposure-complete"><p className="exposure-kicker">TODAY · LOOP CLOSED</p><h1>{source ? `${source.title} changed.` : "Something changed."}<br /><span>The evidence says what.</span></h1><div className="summary-numbers"><div><strong>{summary.exposed}</strong><span>items exposed</span></div><div><strong>{summary.laterRecognized}</strong><span>later recognized</span></div><div><strong>{summary.meaningsRetrieved}</strong><span>meanings retrieved</span></div><div><strong>{summary.remainFamiliar}</strong><span>remain familiar</span></div><div><strong>{summary.stillWeak}</strong><span>still weak</span></div></div><section className="memory-changes"><span>MEANINGFUL CHANGES</span>{changes}</section><section className="session-words"><span>{source ? "THIS SOURCE’S NEIGHBORHOOD" : "TODAY’S NEIGHBORHOOD"}</span>{session.items.map((item) => <div key={item.id}><b lang="ko">{item.targetText}</b><p>{item.naturalMeaning}</p><small>{item.initialModality} · {item.reasonText}</small></div>)}</section><div className="complete-actions">{source && <Link href="/sources">See this source becoming less opaque <span>→</span></Link>}<Link href="/learn">See the evidence in Learning Universe</Link><Link href="/">Return to Language OS</Link></div></div>;
}

function Progress({ current, total, label }: { current: number; total: number; label: string }) { return <div className="exposure-progress"><span>{label}</span><div><i style={{ width: `${(current / total) * 100}%` }} /></div><b>{String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}</b></div>; }
function ResponseButton({ label, detail, shortcut, onClick }: { label: string; detail: string; shortcut: string; onClick: () => void }) { return <button type="button" onClick={onClick}><span><b>{label}</b><small>{detail}</small></span><kbd>{shortcut}</kbd></button>; }
function reasonLabel(reason: string) { return reason.replaceAll("_", " ").toUpperCase(); }
function initialLabel(value: InitialExposureResponse | null) { return value === "know" ? "RECOGNIZED" : value === "familiar" ? "FELT FAMILIAR" : "FELT NEW"; }
