"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ProviderStatusSchema, type ProviderStatus } from "../../lib/coaching/contracts";
import { ORIGINAL_DEMO } from "../../lib/song-analysis/demo";
import { SongAnalysisResponseSchema, type SongLineAnalysis } from "../../lib/song-analysis/contracts";
import {
  createRepeatSession,
  getSessionDraftError,
  parseStoredSessions,
  RepeatSessionSchema,
  serializeSessions,
  SESSION_STORAGE_KEY,
  splitLyrics,
  UNDERSTANDING_LABELS,
  type LineProgress,
  type RepeatMode,
  type RepeatSession,
  type UnderstandingState,
} from "../../lib/repeat-studio/session";

type Screen = "home" | "new" | "studio" | "sheets";
type AnalysisMode = "checking" | "demo" | "live";
type Sheet = "full" | "focus" | "treasure" | "summary";

const MODES: Array<{ id: RepeatMode; number: string; short: string; label: string; intention: string }> = [
  { id: "guess", number: "01", short: "Guess", label: "Listen & guess", intention: "Meet the Korean before the explanation." },
  { id: "unpack", number: "02", short: "Unpack", label: "Unpack the line", intention: "Zoom into structure, nuance, and sound." },
  { id: "hear", number: "03", short: "Hear", label: "Hear it as language", intention: "Hear complete meaningful units." },
  { id: "rebuild", number: "04", short: "Reuse", label: "Rebuild & reuse", intention: "Retrieve only the highest-value pieces." },
  { id: "return", number: "05", short: "Return", label: "Return to the song", intention: "Let the song feel lighter again." },
];

const STATE_ORDER: UnderstandingState[] = ["unknown", "sounds", "partial", "understood", "reusable"];

export function RepeatStudio() {
  const [sessions, setSessions] = useState<RepeatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [initialSheet, setInitialSheet] = useState<Sheet>("focus");
  const [hydrated, setHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [deletedSession, setDeletedSession] = useState<RepeatSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestingRef = useRef(false);

  const active = sessions.find((session) => session.id === activeId) ?? null;

  useEffect(() => {
    const result = parseStoredSessions(window.localStorage.getItem(SESSION_STORAGE_KEY));
    setSessions(result.sessions);
    setStorageWarning(result.warning);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, serializeSessions(sessions));
    } catch {
      setStorageWarning("This browser could not save the latest change. The open session still works, but may not survive a refresh.");
    }
  }, [hydrated, sessions]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/song-analysis", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        const parsed = ProviderStatusSchema.safeParse(value);
        if (parsed.success) setProviderStatus(parsed.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, activeId]);

  const updateSession = useCallback((id: string, update: (session: RepeatSession) => RepeatSession) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== id) return session;
      const candidate = update(session);
      const parsed = RepeatSessionSchema.safeParse({ ...candidate, lastStudiedAt: new Date().toISOString() });
      return parsed.success ? parsed.data : session;
    }));
  }, []);

  async function analyzeSession(session: RepeatSession) {
    if (requestingRef.current) return;
    requestingRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRequestingId(session.id);
    updateSession(session.id, (current) => ({ ...current, analysisStatus: "loading", analysisError: null }));
    try {
      const response = await fetch("/api/song-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: session.title,
          artist: session.artist,
          albumOrSource: session.albumOrSource || undefined,
          personalNotes: session.personalNotes || undefined,
          lines: splitLyrics(session.lyrics, session.existingTranslation),
        }),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The song could not be analyzed.";
        throw new Error(message);
      }
      const parsed = SongAnalysisResponseSchema.safeParse(result);
      if (!parsed.success) throw new Error("The analyzer returned malformed data. Your session is safe; retry when ready.");
      updateSession(session.id, (current) => ({
        ...current,
        analysis: parsed.data.data,
        analysisMeta: parsed.data.meta,
        analysisStatus: "ready",
        analysisError: parsed.data.meta.error,
      }));
    } catch (error) {
      const cancelled = controller.signal.aborted;
      updateSession(session.id, (current) => ({
        ...current,
        analysisStatus: cancelled ? "cancelled" : "error",
        analysisError: cancelled ? "Analysis cancelled. Your song and study notes are saved." : error instanceof Error ? error.message : "Analysis failed. Your session is still saved.",
      }));
    } finally {
      requestingRef.current = false;
      setRequestingId(null);
    }
  }

  function openSession(id: string, nextScreen: Screen = "studio") {
    setActiveId(id);
    setScreen(nextScreen);
  }

  function openSheets(sheet: Sheet = "focus") {
    setInitialSheet(sheet);
    setScreen("sheets");
  }

  function createSession(values: SessionDraft, analyze = true) {
    const session = createRepeatSession(values);
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setScreen("studio");
    if (analyze) void analyzeSession(session);
  }

  function deleteSession(id: string) {
    const removed = sessions.find((session) => session.id === id);
    if (!removed) return;
    setDeletedSession(removed);
    setSessions((current) => current.filter((session) => session.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setScreen("home");
    }
  }

  function undoDelete() {
    if (!deletedSession) return;
    setSessions((current) => [deletedSession, ...current.filter((session) => session.id !== deletedSession.id)]);
    setDeletedSession(null);
  }

  const analysisMode: AnalysisMode = active?.analysisMeta
    ? active.analysisMeta.demoMode ? "demo" : "live"
    : providerStatus ? providerStatus.demoMode ? "demo" : "live" : "checking";

  return (
    <main className={`repeat-app repeat-screen-${screen}`}>
      <header className="repeat-topbar">
        <button type="button" className="repeat-brand" onClick={() => setScreen("home")} aria-label="K-pop Repeat Studio home">
          <span className="repeat-brand-mark">L/</span>
          <span><b>LANGUAGE OS</b><small>K-POP REPEAT STUDIO</small></span>
        </button>
        <nav aria-label="Product navigation">
          <Link href="/">Expression coach</Link>
          {active && <button type="button" onClick={() => openSheets()}>Learning sheets</button>}
          <span className={`repeat-provider ${analysisMode}`}><i />{analysisMode === "checking" ? "CHECKING MODE" : analysisMode === "demo" ? "DEMO ANALYSIS" : "LIVE ANALYSIS"}</span>
        </nav>
      </header>

      {storageWarning && <div className="storage-notice" role="status"><span>{storageWarning}</span><button type="button" onClick={() => setStorageWarning(null)}>Dismiss</button></div>}
      {deletedSession && <div className="undo-notice" role="status"><span>“{deletedSession.title}” was removed from this browser.</span><button type="button" onClick={undoDelete}>Undo</button><button type="button" aria-label="Dismiss delete notice" onClick={() => setDeletedSession(null)}>×</button></div>}

      {!hydrated ? <LoadingHome /> : screen === "home" ? (
        <StudioHome sessions={sessions} providerStatus={providerStatus} onNew={() => setScreen("new")} onDemo={() => createSession(ORIGINAL_DEMO)} onOpen={openSession} onDelete={deleteSession} />
      ) : screen === "new" ? (
        <NewSession onCancel={() => setScreen("home")} onCreate={createSession} onDemo={() => createSession(ORIGINAL_DEMO)} providerStatus={providerStatus} />
      ) : active ? screen === "sheets" ? (
        <LearningSheets session={active} initialSheet={initialSheet} onBack={() => setScreen("studio")} updateSession={updateSession} />
      ) : (
        <ActiveStudio
          session={active}
          isRequesting={requestingId === active.id}
          onAnalyze={() => void analyzeSession(active)}
          onCancel={() => abortRef.current?.abort()}
          onHome={() => setScreen("home")}
          onSheets={() => openSheets()}
          onSummary={() => openSheets("summary")}
          updateSession={updateSession}
        />
      ) : (
        <EmptyMissing onHome={() => setScreen("home")} />
      )}
    </main>
  );
}

type SessionDraft = {
  title: string;
  artist: string;
  albumOrSource?: string;
  lyrics: string;
  existingTranslation?: string;
  personalNotes?: string;
};

function StudioHome({ sessions, providerStatus, onNew, onDemo, onOpen, onDelete }: {
  sessions: RepeatSession[];
  providerStatus: ProviderStatus | null;
  onNew: () => void;
  onDemo: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const mode: AnalysisMode = providerStatus ? providerStatus.demoMode ? "demo" : "live" : "checking";
  return <div className="repeat-home">
    <section className="repeat-hero">
      <p className="repeat-kicker">반복해서 들을수록, 더 깊이.</p>
      <h1>Leave the song playing.<br /><em>Let understanding catch up.</em></h1>
      <p className="repeat-lede">Turn the K-pop loop you already love into five light passes: notice, guess, unpack, reuse, then return to the music.</p>
      <div className="repeat-hero-actions">
        <button className="repeat-primary" type="button" onClick={onNew}>Start with a song <span>→</span></button>
        <button className="repeat-secondary" type="button" onClick={onDemo}>Open original demo</button>
      </div>
      <div className="repeat-cycle" aria-label="Learning cycle">
        {['Notice', 'Guess', 'Unpack', 'React', 'Reuse'].map((word, index) => <span key={word}><b>{String(index + 1).padStart(2, '0')}</b>{word}</span>)}
      </div>
    </section>
    <aside className="repeat-home-aside">
      <div className="side-note"><span>HOW IT FITS</span><p>Keep your music in another app. Repeat Studio stays beside it—quiet, fast, and Korean-first.</p></div>
      <div className="side-note"><span>PRIVACY & TEXT</span><p>You supply the excerpt. Nothing is scraped. Sessions stay in this browser. With live analysis, your pasted text is sent to the configured AI provider only when you request analysis.</p></div>
      <div className={`mode-card ${mode}`}><i /><div><span>{mode === "checking" ? "CHECKING ANALYSIS MODE" : mode === "live" ? "LIVE ANALYSIS READY" : "DEMO MODE READY"}</span><p>{mode === "checking" ? "Confirming whether a server-side provider is available…" : mode === "live" ? "Validated analysis will use the server-side provider." : "The original demo is fully analyzed. Your own text remains usable without invented explanations."}</p></div></div>
    </aside>
    <section className="saved-section">
      <div className="section-heading"><div><p>YOUR LISTENING ROOM</p><h2>Saved sessions</h2></div><span>{sessions.length} local {sessions.length === 1 ? "session" : "sessions"}</span></div>
      {sessions.length === 0 ? <div className="saved-empty"><span>아직 조용해요</span><p>Your first song will stay here on this device, ready for the next repeat.</p><button type="button" onClick={onNew}>Create a session</button></div> : <div className="session-grid">
        {sessions.map((session) => <article className="session-card" key={session.id}>
          <button className="session-open" type="button" onClick={() => onOpen(session.id)}>
            <div className="session-map-mini" aria-label="Understanding preview">{Object.values(session.lineProgress).slice(0, 16).map((line) => <i key={line.lineId} data-state={line.currentState} />)}</div>
            <span className="session-mode">{session.passCount} {session.passCount === 1 ? "LISTEN" : "LISTENS"} LOGGED · {MODES.find((mode) => mode.id === session.mode)?.short.toUpperCase()}</span>
            <h3 lang="ko">{session.title}</h3><p>{session.artist}</p>
            <small>Last opened {formatDate(session.lastStudiedAt)}</small>
          </button>
          <button className="session-delete" type="button" onClick={() => onDelete(session.id)} aria-label={`Delete ${session.title}`}>×</button>
        </article>)}
      </div>}
    </section>
  </div>;
}

function NewSession({ onCancel, onCreate, onDemo, providerStatus }: {
  onCancel: () => void;
  onCreate: (values: SessionDraft, analyze?: boolean) => void;
  onDemo: () => void;
  providerStatus: ProviderStatus | null;
}) {
  const [form, setForm] = useState<SessionDraft>({ title: "", artist: "", albumOrSource: "", lyrics: "", existingTranslation: "", personalNotes: "" });
  const lines = splitLyrics(form.lyrics).length;
  const draftError = getSessionDraftError(form);
  const valid = draftError === null;
  const showDraftError = Boolean(draftError && Object.values(form).some((value) => value?.length));
  function submit(event: FormEvent) { event.preventDefault(); if (valid) onCreate(form); }
  return <div className="new-session-page">
    <button className="back-link" type="button" onClick={onCancel}>← Back to sessions</button>
    <div className="new-session-grid">
      <section>
        <p className="repeat-kicker">새 노래 세션</p><h1>Bring one song.<br />Start with what you hear.</h1>
        <p className="new-intro">An excerpt is enough. Line breaks matter: each non-empty line becomes one study line.</p>
        <div className="copyright-callout"><span>TEXT BOUNDARY</span><p>Paste text you are allowed to study. Repeat Studio never retrieves lyrics. {providerStatus === null ? "Analysis mode is still being checked; the server will clearly label live or demo output." : providerStatus.demoMode === false ? "When you create this session, the excerpt is sent to your configured AI provider for analysis." : "No live provider is configured, so your session uses clearly labeled demo behavior."}</p></div>
        <button className="demo-inline" type="button" onClick={onDemo}>Prefer to explore first? Open the original Korean demo →</button>
      </section>
      <form className="song-form" onSubmit={submit}>
        <div className="form-row"><label>Song title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={160} required autoFocus /></label><label>Artist<input value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} maxLength={160} required /></label></div>
        <label>Album or source note <small>optional</small><input value={form.albumOrSource} onChange={(event) => setForm({ ...form, albumOrSource: event.target.value })} maxLength={240} placeholder="Album, live stage, comeback era…" /></label>
        <label>Korean lyrics or excerpt <span className={lines > 80 ? "form-count-error" : ""}>{lines} / 80 {lines === 1 ? "line" : "lines"}</span><textarea lang="ko" value={form.lyrics} onChange={(event) => setForm({ ...form, lyrics: event.target.value })} rows={10} maxLength={80000} placeholder={'한 줄씩 붙여 넣으세요\n설명은 나중에 열 수 있어요'} required /></label>
        <label>Existing translation <small>optional · non-empty lines pair in order</small><textarea value={form.existingTranslation} onChange={(event) => setForm({ ...form, existingTranslation: event.target.value })} rows={4} maxLength={80000} placeholder="A translation you already have…" /></label>
        <label>Personal note <small>optional</small><textarea value={form.personalNotes} onChange={(event) => setForm({ ...form, personalNotes: event.target.value })} rows={3} maxLength={4000} placeholder="Why this song matters, what you always miss…" /></label>
        {showDraftError && <p className="form-error" role="status">{draftError}</p>}
        <button className="repeat-primary wide" type="submit" disabled={!valid}>Create and analyze <span>→</span></button>
      </form>
    </div>
  </div>;
}

function ActiveStudio({ session, isRequesting, onAnalyze, onCancel, onHome, onSheets, onSummary, updateSession }: {
  session: RepeatSession;
  isRequesting: boolean;
  onAnalyze: () => void;
  onCancel: () => void;
  onHome: () => void;
  onSheets: () => void;
  onSummary: () => void;
  updateSession: (id: string, update: (session: RepeatSession) => RepeatSession) => void;
}) {
  const lines = useMemo(() => splitLyrics(session.lyrics, session.existingTranslation), [session.lyrics, session.existingTranslation]);
  const selectedIndex = Math.max(0, lines.findIndex((line) => line.id === session.selectedLineId));
  const selectedInput = lines[selectedIndex];
  const selectedAnalysis = session.analysis?.lines.find((line) => line.lineId === selectedInput?.id) ?? null;
  const progress = selectedInput ? session.lineProgress[selectedInput.id] : null;
  const mode = MODES.find((item) => item.id === session.mode) ?? MODES[0];

  const selectLine = useCallback((lineId: string) => updateSession(session.id, (current) => ({ ...current, selectedLineId: lineId })), [session.id, updateSession]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault(); selectLine(lines[Math.min(lines.length - 1, selectedIndex + 1)]?.id ?? session.selectedLineId);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault(); selectLine(lines[Math.max(0, selectedIndex - 1)]?.id ?? session.selectedLineId);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lines, selectedIndex, selectLine, session.selectedLineId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [session.mode]);

  function setMode(next: RepeatMode) {
    updateSession(session.id, (current) => ({ ...current, mode: next }));
  }
  function setLineProgress(lineId: string, change: Partial<LineProgress>) {
    updateSession(session.id, (current) => ({ ...current, lineProgress: { ...current.lineProgress, [lineId]: { ...current.lineProgress[lineId], ...change } } }));
  }

  return <div className={`active-studio mode-${session.mode}`}>
    <aside className="pass-rail">
      <button className="rail-song" type="button" onClick={onHome}><span>← SESSIONS</span><strong lang="ko">{session.title}</strong><small>{session.artist}</small></button>
      <p className="rail-heading">LISTENING PASSES</p>
      <ol>{MODES.map((item) => <li key={item.id}><button type="button" className={item.id === session.mode ? "active" : ""} onClick={() => setMode(item.id)} aria-current={item.id === session.mode ? "step" : undefined}><span>{item.number}</span><div><strong>{item.label}</strong><small>{item.intention}</small></div></button></li>)}</ol>
      <div className="rail-actions"><button type="button" onClick={onSheets}>Learning sheets <span>↗</span></button><p>{lines.length} lines · {session.passCount} {session.passCount === 1 ? "listen" : "listens"} logged</p></div>
    </aside>

    <section className="studio-main">
      <header className="studio-heading"><div><p>PASS {mode.number} · {mode.short.toUpperCase()}</p><h1>{mode.label}</h1></div><div className="studio-position"><span>{String(selectedIndex + 1).padStart(2, "0")} / {String(lines.length).padStart(2, "0")}</span><small>J / K to move</small></div></header>
      <UnderstandingMap session={session} lines={lines} onSelect={selectLine} />
      {session.mode !== "guess" && selectedInput && progress && <CurrentUnderstanding line={selectedInput.text} progress={progress} onChange={(state) => setLineProgress(selectedInput.id, { currentState: state, initialState: progress.initialState ?? progress.currentState })} />}
      {session.analysisStatus === "loading" && <AnalysisNotice kind="loading" message="Building a validated Korean-first breakdown…" action="Cancel" onAction={onCancel} />}
      {session.analysisError && session.analysisStatus !== "loading" && <AnalysisNotice kind={session.analysisStatus === "ready" ? "notice" : "error"} message={session.analysisError} action={session.analysisStatus === "ready" ? undefined : "Retry analysis"} onAction={onAnalyze} />}
      {!session.analysis && session.analysisStatus === "idle" && <AnalysisNotice kind="notice" message="This session is ready to study. Generate a breakdown when you want explanations." action="Analyze excerpt" onAction={onAnalyze} />}
      {session.analysis?.partial && <AnalysisNotice kind="notice" message={`${session.analysis.omittedLineIds.length} ${session.analysis.omittedLineIds.length === 1 ? "line has" : "lines have"} no detailed analysis. The Korean and your progress remain available.`} onAction={onAnalyze} />}

      {session.mode === "guess" && selectedInput && progress && <GuessMode lines={lines} session={session} selected={selectedInput} analysis={selectedAnalysis} progress={progress} onSelect={selectLine} setProgress={setLineProgress} />}
      {session.mode === "unpack" && selectedInput && progress && <UnpackMode lines={lines} selected={selectedInput} analysis={selectedAnalysis} progress={progress} onSelect={selectLine} setProgress={setLineProgress} onAnalyze={onAnalyze} isRequesting={isRequesting} />}
      {session.mode === "hear" && <HearMode lines={lines} session={session} onSelect={selectLine} />}
      {session.mode === "rebuild" && <RebuildMode session={session} lines={lines} updateSession={updateSession} />}
      {session.mode === "return" && <ReturnMode session={session} lines={lines} onSelect={selectLine} onSummary={onSummary} onLog={() => updateSession(session.id, (current) => ({ ...current, passCount: current.passCount + 1 }))} />}
    </section>
  </div>;
}

function UnderstandingMap({ session, lines, onSelect }: { session: RepeatSession; lines: ReturnType<typeof splitLyrics>; onSelect: (id: string) => void }) {
  const counts = STATE_ORDER.map((state) => lines.filter((line) => session.lineProgress[line.id]?.currentState === state).length);
  return <div className="understanding-map"><div className="map-label"><span>UNDERSTANDING MAP</span><small>{counts[0]} unknown · {counts[2]} partial · {counts[3] + counts[4]} clear</small></div><div className="map-lines">{lines.map((line, index) => <button key={line.id} type="button" data-state={session.lineProgress[line.id]?.currentState ?? "unknown"} className={session.selectedLineId === line.id ? "selected" : ""} onClick={() => onSelect(line.id)} aria-label={`Line ${index + 1}: ${UNDERSTANDING_LABELS[session.lineProgress[line.id]?.currentState ?? "unknown"]}`}><span>{index + 1}</span></button>)}</div><div className="map-legend">{STATE_ORDER.map((state) => <span key={state}><i data-state={state} />{UNDERSTANDING_LABELS[state]}</span>)}</div></div>;
}

function CurrentUnderstanding({ line, progress, onChange }: { line: string; progress: LineProgress; onChange: (state: UnderstandingState) => void }) {
  return <section className="current-understanding" aria-label="Update current understanding"><div><span>NOW, AFTER CONTACT</span><p lang="ko">{line}</p></div><fieldset><legend>How does this line reach you now?</legend>{STATE_ORDER.map((state) => <button key={state} type="button" className={progress.currentState === state ? "selected" : ""} aria-pressed={progress.currentState === state} onClick={() => onChange(state)}>{UNDERSTANDING_LABELS[state]}</button>)}</fieldset></section>;
}

function GuessMode({ lines, session, selected, analysis, progress, onSelect, setProgress }: {
  lines: ReturnType<typeof splitLyrics>; session: RepeatSession; selected: ReturnType<typeof splitLyrics>[number]; analysis: SongLineAnalysis | null; progress: LineProgress; onSelect: (id: string) => void; setProgress: (id: string, change: Partial<LineProgress>) => void;
}) {
  return <div className="line-workspace"><div className="korean-line-list" role="listbox" aria-label="Song lines">{lines.map((line, index) => { const lineProgress = session.lineProgress[line.id]; return <button role="option" aria-selected={selected.id === line.id} className={selected.id === line.id ? "selected" : ""} key={line.id} type="button" onClick={() => onSelect(line.id)}><span>{String(index + 1).padStart(2, "0")}</span><p lang="ko">{line.text}</p><i data-state={lineProgress.currentState} /></button>; })}</div><aside className="line-inspector"><p className="inspector-label">BEFORE THE ANSWER</p><h2 lang="ko">{selected.text}</h2><fieldset className="state-picker"><legend>What reaches you right now?</legend>{STATE_ORDER.slice(0, 4).map((state) => <button key={state} type="button" className={progress.currentState === state ? "selected" : ""} aria-pressed={progress.currentState === state} onClick={() => setProgress(selected.id, { currentState: state, initialState: progress.initialState ?? state })}>{UNDERSTANDING_LABELS[state]}</button>)}</fieldset><label className="interpretation-field">MY INTERPRETATION<textarea value={progress.interpretation} onChange={(event) => setProgress(selected.id, { interpretation: event.target.value })} rows={4} placeholder="What do you think the line means or feels like?" /></label><div className="quick-actions"><button type="button" className={progress.marked ? "active" : ""} aria-pressed={progress.marked} onClick={() => setProgress(selected.id, { marked: !progress.marked })}>{progress.marked ? "◆ Marked for later" : "◇ Mark for later"}</button></div><div className="progressive-reveals"><Reveal label="Meaning" open={progress.reveals.meaning} disabled={!analysis} onOpen={() => setProgress(selected.id, { reveals: { ...progress.reveals, meaning: true } })}>{analysis?.naturalMeaning}</Reveal><Reveal label="Structure" open={progress.reveals.structure} disabled={!analysis} onOpen={() => setProgress(selected.id, { reveals: { ...progress.reveals, structure: true } })}>{analysis && <><p>{analysis.structuralMeaning}</p><div className="segment-row">{analysis.segments.map((segment) => <span key={`${segment.text}-${segment.meaning}`}><b lang="ko">{segment.text}</b><small>{segment.meaning}</small></span>)}</div></>}</Reveal></div>{!analysis && <p className="analysis-placeholder">{session.analysisStatus === "loading" ? "Analysis is arriving. Your guess is already saved." : "No detailed explanation is available yet."}</p>}</aside></div>;
}

function UnpackMode({ lines, selected, analysis, progress, onSelect, setProgress, onAnalyze, isRequesting }: {
  lines: ReturnType<typeof splitLyrics>; selected: ReturnType<typeof splitLyrics>[number]; analysis: SongLineAnalysis | null; progress: LineProgress; onSelect: (id: string) => void; setProgress: (id: string, change: Partial<LineProgress>) => void; onAnalyze: () => void; isRequesting: boolean;
}) {
  return <div className="unpack-layout"><nav className="compact-line-nav" aria-label="Select lyric line">{lines.map((line, index) => <button type="button" key={line.id} className={selected.id === line.id ? "active" : ""} onClick={() => onSelect(line.id)}><span>{index + 1}</span><b lang="ko">{line.text}</b></button>)}</nav><article className="unpack-card">{analysis ? <><header><p>LINE ANALYSIS</p><h2 lang="ko">{analysis.originalKorean}</h2><div><span>{analysis.naturalMeaning}</span><button type="button" className={progress.marked ? "active" : ""} aria-pressed={progress.marked} onClick={() => setProgress(selected.id, { marked: !progress.marked })}>{progress.marked ? "◆ Marked" : "◇ Mark line"}</button></div></header><section className="analysis-section open"><span>01 · PHRASE SHAPE</span><p className="structural">{analysis.structuralMeaning}</p><div className="segment-row large">{analysis.segments.map((segment) => <span key={`${segment.text}-${segment.meaning}`}><b lang="ko">{segment.text}</b><small>{segment.meaning}</small>{segment.role && <em>{segment.role}</em>}</span>)}</div></section><details className="analysis-section" open={progress.reveals.depth} onToggle={(event) => setProgress(selected.id, { reveals: { ...progress.reveals, depth: (event.currentTarget as HTMLDetailsElement).open } })}><summary>02 · VOCABULARY <small>{analysis.vocabulary.length}</small></summary><div className="analysis-items">{analysis.vocabulary.length ? analysis.vocabulary.map((item) => <div className="analysis-item" key={item.id}><button type="button" className={progress.markedVocabularyIds.includes(item.id) ? "marked" : ""} aria-pressed={progress.markedVocabularyIds.includes(item.id)} onClick={() => setProgress(selected.id, { markedVocabularyIds: toggle(progress.markedVocabularyIds, item.id) })} aria-label={`Mark ${item.surfaceForm}`}>◇</button><div><h3 lang="ko">{item.surfaceForm} <span>← {item.dictionaryForm}</span></h3><p>{item.meaningInLine}</p>{item.nuance && <small>{item.nuance}</small>}<em>{item.reusability} reuse</em></div></div>) : <p className="no-analysis-items">No selective vocabulary note for this line.</p>}</div></details><details className="analysis-section"><summary>03 · GRAMMAR & RELATIONSHIPS <small>{analysis.grammar.length}</small></summary><div className="analysis-items">{analysis.grammar.length ? analysis.grammar.map((item) => <div className="analysis-item grammar" key={item.id}><button type="button" className={progress.markedGrammarIds.includes(item.id) ? "marked" : ""} aria-pressed={progress.markedGrammarIds.includes(item.id)} onClick={() => setProgress(selected.id, { markedGrammarIds: toggle(progress.markedGrammarIds, item.id) })} aria-label={`Mark ${item.formAsUsed}`}>◇</button><div><h3 lang="ko">{item.formAsUsed} <span>{item.basePattern}</span></h3><p>{item.functionInLine}</p><small>{item.explanation}</small>{item.nearbyAlternative && <small><b>Contrast:</b> {item.nearbyAlternative}</small>}{item.reusableExample && <blockquote lang="ko">{item.reusableExample}</blockquote>}</div></div>) : <p className="no-analysis-items">No selective grammar note for this line.</p>}</div></details><details className="analysis-section"><summary>04 · NUANCE & SOUND</summary><div className="nuance-grid"><div><span>WHY IT FEELS THIS WAY</span><p>{analysis.nuance}</p></div><div><span>WHAT TO LISTEN FOR</span><p>{analysis.listeningCue}</p></div>{analysis.culturalNote && <div><span>CONTEXT</span><p>{analysis.culturalNote}</p></div>}</div></details><label className="line-notes">LEARNER NOTE<textarea rows={3} value={progress.notes} onChange={(event) => setProgress(selected.id, { notes: event.target.value })} placeholder="What clicked? What still feels unstable?" /></label></> : <div className="empty-analysis"><span>분석을 기다리는 중</span><h2>Keep the guess. Add depth when you want it.</h2><p>Your Korean lines and interpretations are already saved.</p><button className="repeat-primary" type="button" onClick={onAnalyze} disabled={isRequesting}>{isRequesting ? "Analyzing…" : "Analyze this excerpt"}</button></div>}</article></div>;
}

function HearMode({ lines, session, onSelect }: { lines: ReturnType<typeof splitLyrics>; session: RepeatSession; onSelect: (id: string) => void }) {
  return <div className="hear-mode"><div className="mode-guidance"><span>LISTENING INTENTION</span><p>Let each line arrive as a phrase. Cues stay small; open a line only if it collapses again.</p></div><div className="hear-lines">{lines.map((line, index) => { const progress = session.lineProgress[line.id]; const analysis = session.analysis?.lines.find((item) => item.lineId === line.id); return <button type="button" key={line.id} onClick={() => onSelect(line.id)} className={progress.marked ? "trouble" : ""}><span>{String(index + 1).padStart(2, "0")}</span><div><p lang="ko">{line.text}</p>{(progress.marked || progress.currentState === "unknown" || progress.currentState === "sounds") && analysis && <small>{analysis.listeningCue}</small>}</div><i data-state={progress.currentState} /></button>; })}</div></div>;
}

function RebuildMode({ session, lines, updateSession }: { session: RepeatSession; lines: ReturnType<typeof splitLyrics>; updateSession: (id: string, update: (session: RepeatSession) => RepeatSession) => void }) {
  const candidates = [...lines].sort((a, b) => priority(session, b.id) - priority(session, a.id)).slice(0, 3);
  function save(lineId: string, kind: "restore" | "meaning", prompt: string, response: string, completed: boolean) {
    updateSession(session.id, (current) => ({ ...current, rebuildAttempts: [...current.rebuildAttempts, { id: globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}`, lineId, kind, prompt, response, completed, createdAt: new Date().toISOString() }].slice(-500) }));
  }
  function saveReuse(lineId: string, value: string) { updateSession(session.id, (current) => ({ ...current, reuseSentences: { ...current.reuseSentences, [lineId]: value } })); }
  return <div className="rebuild-mode"><div className="mode-guidance"><span>FOCUSED OUTPUT</span><p>Only three useful trouble spots. Retrieval can be incomplete; the aim is a stronger relationship with the phrase, not a score.</p></div><div className="activity-stack">{candidates.map((line, index) => { const analysis = session.analysis?.lines.find((item) => item.lineId === line.id); const target = analysis?.segments.at(-1)?.text ?? line.text.split(" ").at(-1) ?? line.text; const masked = line.text.replace(target, "＿＿＿＿"); return <ActivityCard key={line.id} number={index + 1} line={line.text} masked={masked} target={target} meaning={analysis?.naturalMeaning} reuse={session.reuseSentences[line.id] ?? ""} onRestore={(value) => { const matched = normalize(value) === normalize(target); save(line.id, "restore", masked, value, matched); return matched; }} onMeaning={(value) => save(line.id, "meaning", line.text, value, value.trim().length > 2)} onReuse={(value) => saveReuse(line.id, value)} />; })}</div></div>;
}

function ActivityCard({ number, line, masked, target, meaning, reuse, onRestore, onMeaning, onReuse }: { number: number; line: string; masked: string; target: string; meaning?: string; reuse: string; onRestore: (value: string) => boolean; onMeaning: (value: string) => void; onReuse: (value: string) => void }) {
  const [restore, setRestore] = useState(""); const [recall, setRecall] = useState(""); const [revealed, setRevealed] = useState(false); const [restoreNote, setRestoreNote] = useState<string | null>(null); const [recallSaved, setRecallSaved] = useState(false);
  return <article className="activity-card"><header><span>{String(number).padStart(2, "0")}</span><div><p>RESTORE · RECALL · REUSE</p><h2 lang="ko">{line}</h2></div></header><div className="activity-grid"><section><label>Restore the missing phrase</label><p className="activity-prompt" lang="ko">{masked}</p><div className="inline-input"><input lang="ko" value={restore} onChange={(event) => { setRestore(event.target.value); setRestoreNote(null); }} placeholder="빠진 표현" /><button type="button" onClick={() => setRestoreNote(onRestore(restore) ? "Saved — phrase matches." : "Saved — compare after reveal.")} disabled={!restore.trim()}>Save</button></div>{restoreNote && <p className="activity-feedback" role="status">{restoreNote}</p>}<button className="text-reveal" type="button" onClick={() => setRevealed(true)}>{revealed ? target : "Reveal phrase"}</button></section><section><label>Recall the meaning</label><textarea value={recall} onChange={(event) => { setRecall(event.target.value); setRecallSaved(false); }} rows={2} placeholder="Say it simply, in your own words." /><button className="small-save" type="button" onClick={() => { onMeaning(recall); setRecallSaved(true); }} disabled={!recall.trim()}>Save recall</button>{recallSaved && <p className="activity-feedback" role="status">Recall saved.</p>}{revealed && meaning && <p className="answer-note">{meaning}</p>}</section><section className="reuse-activity"><label>Use its feeling in your life</label><textarea lang="ko" value={reuse} onChange={(event) => onReuse(event.target.value)} rows={2} placeholder="이 표현으로 내 문장을 써 보세요…" /><small>Saved as you type. Fragments are welcome.</small></section></div></article>;
}

function ReturnMode({ session, lines, onSelect, onSummary, onLog }: { session: RepeatSession; lines: ReturnType<typeof splitLyrics>; onSelect: (id: string) => void; onSummary: () => void; onLog: () => void }) {
  const unstable = lines.filter((line) => ["unknown", "sounds", "partial"].includes(session.lineProgress[line.id].currentState));
  return <div className="return-mode"><div className="return-header"><div><span>다시 노래로</span><h2>Press play again.<br />Keep only one thing in mind.</h2><p>{nextFocus(session, lines)}</p><button className="log-listen" type="button" onClick={onLog}>+ Log a completed listen</button><small>{session.passCount} {session.passCount === 1 ? "listen" : "listens"} logged by you</small></div><div className="return-count"><strong>{lines.length - unstable.length}</strong><span>of {lines.length} lines feel clear</span><small>Not a score—just your current map.</small></div></div><div className="return-lyrics">{lines.map((line, index) => <button key={line.id} type="button" onClick={() => onSelect(line.id)}><span>{String(index + 1).padStart(2, "0")}</span><p lang="ko">{line.text}</p>{session.lineProgress[line.id].marked && <i>focus</i>}</button>)}</div><div className="return-footer"><p>{unstable.length ? `${unstable.length} lines are still unstable. Let the next loop test them gently.` : "Every line currently feels clear. Listen once without opening anything."}</p><button type="button" onClick={onSummary}>Open after-listening summary →</button></div></div>;
}

function LearningSheets({ session, initialSheet, onBack, updateSession }: { session: RepeatSession; initialSheet: Sheet; onBack: () => void; updateSession: (id: string, update: (session: RepeatSession) => RepeatSession) => void }) {
  const [sheet, setSheet] = useState<Sheet>(initialSheet);
  const lines = splitLyrics(session.lyrics, session.existingTranslation);
  const analyzed = session.analysis?.lines ?? [];
  const difficult = lines.filter((line) => { const p = session.lineProgress[line.id]; return p.marked || ["unknown", "sounds", "partial"].includes(p.currentState); });
  const treasures = buildTreasures(session);
  return <div className="sheets-page"><header className="sheets-header no-print"><button type="button" onClick={onBack}>← Back to studio</button><div><p>LEARNING SHEETS</p><h1 lang="ko">{session.title}</h1></div><button className="print-button" type="button" onClick={() => window.print()}>Print this sheet</button></header><nav className="sheet-tabs no-print">{([['full','Full breakdown'],['focus','Repeat focus'],['treasure','Phrase treasure'],['summary','After listening']] as const).map(([id,label]) => <button key={id} className={sheet === id ? "active" : ""} type="button" onClick={() => setSheet(id)}>{label}</button>)}</nav><article className="print-sheet"><div className="print-title"><span>LANGUAGE OS · K-POP REPEAT STUDIO</span><h1>{sheetTitle(sheet)}</h1><p><b lang="ko">{session.title}</b> · {session.artist}</p></div>{sheet === "full" && <FullBreakdown lines={lines} analyzed={analyzed} session={session} />}{sheet === "focus" && <FocusSheet lines={difficult} session={session} />}{sheet === "treasure" && <TreasureSheet treasures={treasures} session={session} updateSession={updateSession} />}{sheet === "summary" && <SummarySheet lines={lines} session={session} />}</article></div>;
}

function FullBreakdown({ lines, analyzed, session }: { lines: ReturnType<typeof splitLyrics>; analyzed: SongLineAnalysis[]; session: RepeatSession }) { return <><SongOverview session={session} /><div className="sheet-lines">{lines.map((input, index) => { const line = analyzed.find((item) => item.lineId === input.id); return <section key={input.id}><span>LINE {String(index + 1).padStart(2, "0")}</span><h2 lang="ko">{input.text}</h2>{line ? <><p className="sheet-meaning">{line.naturalMeaning}</p><p><b>Close structure:</b> {line.structuralMeaning}</p><div className="sheet-segments">{line.segments.map((segment) => <span key={segment.text}><b lang="ko">{segment.text}</b>{segment.meaning}</span>)}</div>{line.vocabulary.length > 0 && <p><b>Vocabulary:</b> {line.vocabulary.map((item) => `${item.surfaceForm} (${item.dictionaryForm}) — ${item.meaningInLine}`).join(" · ")}</p>}{line.grammar.length > 0 && <p><b>Grammar:</b> {line.grammar.map((item) => `${item.formAsUsed} — ${item.functionInLine}`).join(" · ")}</p>}<p><b>Nuance:</b> {line.nuance}</p><p><b>Listen:</b> {line.listeningCue}</p>{line.culturalNote && <p><b>Context:</b> {line.culturalNote}</p>}</> : <p className="sheet-meaning">No detailed analysis saved for this line.</p>}{session.lineProgress[input.id].notes && <p><b>My note:</b> {session.lineProgress[input.id].notes}</p>}</section>; })}</div></>; }

function SongOverview({ session }: { session: RepeatSession }) {
  const analysis = session.analysis;
  if (!analysis) return null;
  return <section className="song-overview"><span>SONG VIEW</span><h2>{analysis.overview}</h2><p><b>Tone:</b> {analysis.overallTone}</p><div><p><b>Recurring ideas:</b> {analysis.recurringIdeas.join(" · ")}</p><p><b>Repeated words:</b> {analysis.repeatedVocabulary.join(" · ") || "No repeated vocabulary highlighted."}</p><p><b>Repeated grammar:</b> {analysis.repeatedGrammar.join(" · ") || "No repeated grammar highlighted."}</p><p><b>Style:</b> {analysis.stylisticFeatures.join(" · ")}</p><p><b>Learning priorities:</b> {analysis.learningPriorities.join(" · ")}</p></div></section>;
}

function FocusSheet({ lines, session }: { lines: ReturnType<typeof splitLyrics>; session: RepeatSession }) { return lines.length ? <div className="sheet-lines focus">{lines.map((input, index) => { const line = session.analysis?.lines.find((item) => item.lineId === input.id); const progress = session.lineProgress[input.id]; return <section key={input.id}><span>FOCUS {String(index + 1).padStart(2, "0")} · {UNDERSTANDING_LABELS[progress.currentState]}</span><h2 lang="ko">{input.text}</h2>{progress.interpretation && <p><b>My first reading:</b> {progress.interpretation}</p>}{line && <><p className="sheet-meaning">{line.naturalMeaning}</p><p><b>Listen for:</b> {line.listeningCue}</p></>}{progress.markedVocabularyIds.length > 0 && <p><b>Marked words:</b> {markedVocabulary(session, progress).join(" · ")}</p>}{progress.markedGrammarIds.length > 0 && <p><b>Marked grammar:</b> {markedGrammar(session, progress).join(" · ")}</p>}</section>})}<div className="sheet-next"><span>NEXT LISTEN</span><p>{nextFocus(session, splitLyrics(session.lyrics, session.existingTranslation))}</p></div></div> : <div className="sheet-empty"><h2>No difficult lines are marked.</h2><p>Return to the song and let the next listen reveal what is still unstable.</p></div>; }

type Treasure = { line: SongLineAnalysis; segment: SongLineAnalysis["segments"][number]; key: string };

function TreasureSheet({ treasures, session, updateSession }: { treasures: Treasure[]; session: RepeatSession; updateSession: (id: string, update: (session: RepeatSession) => RepeatSession) => void }) { return treasures.length ? <div className="treasure-grid">{treasures.map(({ line, segment, key }, index) => <section key={key}><span>TREASURE {String(index + 1).padStart(2, "0")}</span><h2 lang="ko">{segment.text}</h2><p className="sheet-meaning">{segment.meaning}</p><p><b>Nuance:</b> {line.nuance}</p><p><b>Why keep it:</b> This phrase contains a reusable or personally marked word and carries meaning as a unit.</p><label>MY SENTENCE<textarea lang="ko" rows={2} value={session.reuseSentences[key] ?? ""} onChange={(event) => updateSession(session.id, (current) => ({ ...current, reuseSentences: { ...current.reuseSentences, [key]: event.target.value } }))} /></label></section>)}</div> : <div className="sheet-empty"><h2>No phrase treasures yet.</h2><p>Mark a useful word during Unpack, or analyze lines with high-reuse vocabulary.</p></div>; }

function SummarySheet({ lines, session }: { lines: ReturnType<typeof splitLyrics>; session: RepeatSession }) {
  const improved = lines.filter((line) => { const p = session.lineProgress[line.id]; return p.initialState && STATE_ORDER.indexOf(p.currentState) > STATE_ORDER.indexOf(p.initialState); });
  const unstable = lines.filter((line) => ["unknown", "sounds", "partial"].includes(session.lineProgress[line.id].currentState));
  const words = unique(session.analysis?.lines.flatMap((line) => line.vocabulary.filter((item) => session.lineProgress[line.lineId].markedVocabularyIds.includes(item.id)).map((item) => `${item.surfaceForm} — ${item.meaningInLine}`)) ?? []);
  const grammar = unique(session.analysis?.lines.flatMap((line) => line.grammar.filter((item) => session.lineProgress[line.lineId].markedGrammarIds.includes(item.id)).map((item) => `${item.formAsUsed} — ${item.functionInLine}`)) ?? []);
  const treasureLabels = new Map(buildTreasures(session).map((item) => [item.key, item.segment.text]));
  const reuse = unique(Object.entries(session.reuseSentences).filter(([, value]) => value.trim()).map(([key, value]) => `${lines.find((line) => line.id === key)?.text ?? treasureLabels.get(key) ?? "My phrase"} → ${value.trim()}`));
  return <div className="summary-sheet"><section><span>WHAT CHANGED</span><h2>{improved.length ? `${improved.length} ${improved.length === 1 ? "line has" : "lines have"} moved beyond the first reading.` : "This map is still a baseline."}</h2><p>{improved.length ? improved.map((line) => line.text).join(" · ") : "Keep listening; honest uncertainty is useful evidence."}</p></section><div className="summary-columns"><section><span>STILL UNSTABLE</span>{unstable.length ? unstable.map((line) => <p lang="ko" key={line.id}>{line.text}</p>) : <p>No unstable lines are currently marked.</p>}</section><section><span>USEFUL WORDS</span>{words.length ? words.map((word) => <p key={word}>{word}</p>) : <p>No words marked yet.</p>}</section><section><span>USEFUL GRAMMAR</span>{grammar.length ? grammar.map((item) => <p key={item}>{item}</p>) : <p>No grammar marked yet.</p>}</section><section><span>BEGIN REUSING</span>{reuse.length ? reuse.map((item) => <p key={item}>{item}</p>) : <p>No personal reuse sentence yet.</p>}</section></div><div className="sheet-next"><span>NEXT LISTEN</span><p>{nextFocus(session, lines)}</p></div><footer>Started {formatDate(session.startedAt)} · {session.passCount} learner-logged {session.passCount === 1 ? "listen" : "listens"} · local, learner-owned record</footer></div>;
}

function Reveal({ label, open, disabled, onOpen, children }: { label: string; open: boolean; disabled: boolean; onOpen: () => void; children: React.ReactNode }) { return <section className={`reveal-block ${open ? "open" : ""}`}><header><span>{label}</span>{!open && <button type="button" onClick={onOpen} disabled={disabled}>{disabled ? "Not available" : `Reveal ${label.toLowerCase()}`}</button>}</header>{open && <div className="reveal-content">{typeof children === "string" ? <p>{children}</p> : children}</div>}</section>; }
function AnalysisNotice({ kind, message, action, onAction }: { kind: "loading" | "notice" | "error"; message: string; action?: string; onAction: () => void }) { return <div className={`analysis-notice ${kind}`} role={kind === "error" ? "alert" : "status"}><i /><p>{message}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function LoadingHome() { return <div className="loading-home"><i /><p>Opening your listening room…</p></div>; }
function EmptyMissing({ onHome }: { onHome: () => void }) { return <div className="loading-home"><p>That saved session is no longer available.</p><button type="button" onClick={onHome}>Return home</button></div>; }
function toggle(values: string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }
function normalize(value: string) { return value.replace(/\s+/g, "").trim(); }
function unique(values: string[]) { return [...new Set(values)]; }
function buildTreasures(session: RepeatSession): Treasure[] {
  const seen = new Set<string>();
  const treasures: Treasure[] = [];
  for (const line of session.analysis?.lines ?? []) {
    const progress = session.lineProgress[line.lineId];
    const usefulWords = line.vocabulary.filter((word) => word.reusability === "high" || progress?.markedVocabularyIds.includes(word.id));
    line.segments.forEach((segment, index) => {
      const segmentText = normalize(segment.text);
      const containsUsefulWord = usefulWords.some((word) => segmentText.includes(normalize(word.surfaceForm)) || normalize(word.surfaceForm).includes(segmentText));
      if (!containsUsefulWord || seen.has(segmentText)) return;
      seen.add(segmentText);
      treasures.push({ line, segment, key: `treasure:${line.lineId}:${index}` });
    });
  }
  return treasures.slice(0, 10);
}
function priority(session: RepeatSession, lineId: string) { const p = session.lineProgress[lineId]; const analysis = session.analysis?.lines.find((line) => line.lineId === lineId); return (p.marked ? 10 : 0) + (4 - STATE_ORDER.indexOf(p.currentState)) * 3 + (analysis?.reviewPriority === "high" ? 3 : analysis?.reviewPriority === "medium" ? 1 : 0); }
function nextFocus(session: RepeatSession, lines: ReturnType<typeof splitLyrics>) { const target = [...lines].sort((a, b) => priority(session, b.id) - priority(session, a.id))[0]; const analysis = session.analysis?.lines.find((line) => line.lineId === target?.id); return analysis?.listeningCue ?? (target ? `Listen for “${target.text}” as one complete unit.` : "Listen once without looking at an explanation."); }
function markedVocabulary(session: RepeatSession, progress: LineProgress) { return session.analysis?.lines.flatMap((line) => line.vocabulary.filter((item) => progress.markedVocabularyIds.includes(item.id)).map((item) => `${item.surfaceForm} — ${item.meaningInLine}`)) ?? []; }
function markedGrammar(session: RepeatSession, progress: LineProgress) { return session.analysis?.lines.flatMap((line) => line.grammar.filter((item) => progress.markedGrammarIds.includes(item.id)).map((item) => `${item.formAsUsed} — ${item.functionInLine}`)) ?? []; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(value)); }
function sheetTitle(sheet: Sheet) { return { full: "Full Song Breakdown", focus: "Repeat Focus Sheet", treasure: "Phrase Treasure Sheet", summary: "After-Listening Summary" }[sheet]; }
