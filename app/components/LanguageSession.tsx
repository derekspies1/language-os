"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type CoachMeta,
  type CoachingAnalysis,
  type CoachingContext,
  type RebuildEvaluation,
  type SessionSummary,
  type StressAnswerEvaluation,
  type StressQuestion,
  languages,
} from "../lib/coaching/contracts";

type Stage = "mission" | "attempt" | "scaffold" | "rebuild" | "stress" | "complete";
type RequestState = "idle" | "loading" | "success" | "error" | "cancelled";

const stages: Array<{ id: Stage; number: string; label: string }> = [
  { id: "mission", number: "01", label: "Mission" },
  { id: "attempt", number: "02", label: "Attempt" },
  { id: "scaffold", number: "03", label: "Scaffold" },
  { id: "rebuild", number: "04", label: "Rebuild" },
  { id: "stress", number: "05", label: "Stress test" },
  { id: "complete", number: "06", label: "Capability" },
];

const exampleMission = "I want to explain why learning Codex was mentally difficult today.";

export function LanguageSession() {
  const [stage, setStage] = useState<Stage>("mission");
  const [mission, setMission] = useState("");
  const [languageCode, setLanguageCode] = useState("ko");
  const [firstAttempt, setFirstAttempt] = useState("");
  const [rebuild, setRebuild] = useState("");
  const [analysis, setAnalysis] = useState<CoachingAnalysis | null>(null);
  const [rebuildEvaluation, setRebuildEvaluation] = useState<RebuildEvaluation | null>(null);
  const [questions, setQuestions] = useState<StressQuestion[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [stressIndex, setStressIndex] = useState(0);
  const [stressAnswers, setStressAnswers] = useState<string[]>([]);
  const [stressEvaluations, setStressEvaluations] = useState<StressAnswerEvaluation[]>([]);
  const [stressDraft, setStressDraft] = useState("");
  const [stressHint, setStressHint] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [awaitingSummary, setAwaitingSummary] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [meta, setMeta] = useState<CoachMeta | null>(null);
  const [providerStatus, setProviderStatus] = useState<{ provider: "openai" | "mock"; model: string; demoMode: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeIndex = stages.findIndex((item) => item.id === stage);
  const language = languages.find((item) => item.code === languageCode) ?? languages[0];
  const isLoading = requestState === "loading";
  const currentProvider = meta?.provider ?? providerStatus?.provider ?? "mock";
  const demoMode = meta?.demoMode ?? providerStatus?.demoMode ?? true;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => value && setProviderStatus(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const context = useMemo<CoachingContext>(() => ({
    mission: mission || exampleMission,
    intendedMeaning: mission || exampleMission,
    targetLanguage: { code: language.code, label: language.label },
    initialAttempt: firstAttempt || "Attempt not submitted",
    previousAttempts: [firstAttempt, rebuild, ...stressAnswers].filter(Boolean),
    stage: stage === "attempt" || stage === "scaffold" ? "attempt" : stage === "rebuild" ? "rebuild" : stage === "stress" ? "stress" : "complete",
  }), [mission, language, firstAttempt, rebuild, stressAnswers, stage]);

  async function coachRequest<T>(payload: unknown): Promise<T | null> {
    if (isLoading) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRequestState("loading");
    setRequestError(null);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The coaching request could not be completed.");
      setMeta(result.meta);
      setRequestState("success");
      if (result.meta.error) setRequestError(result.meta.error);
      return result.data as T;
    } catch (error) {
      if (controller.signal.aborted) {
        setRequestState("cancelled");
        setRequestError("Request cancelled. Your work is preserved.");
        return null;
      }
      setRequestState("error");
      setRequestError(error instanceof Error ? error.message : "The coach could not respond. Your attempt is still here.");
      return null;
    }
  }

  function submitMission(event: FormEvent) {
    event.preventDefault();
    if (mission.trim()) setStage("attempt");
  }

  async function analyzeAttempt() {
    if (!firstAttempt.trim()) return;
    const result = await coachRequest<CoachingAnalysis>({ action: "analyze_attempt", context: { ...context, stage: "attempt" } });
    if (result) {
      setAnalysis(result);
      setStage("scaffold");
    }
  }

  async function submitAttempt(event?: FormEvent) {
    event?.preventDefault();
    await analyzeAttempt();
  }

  async function evaluateRebuild(event?: FormEvent) {
    event?.preventDefault();
    if (!rebuild.trim()) return;
    const result = await coachRequest<{ evaluation: RebuildEvaluation; questions: StressQuestion[] }>({
      action: "evaluate_rebuild",
      context: { ...context, stage: "rebuild", previousAttempts: [firstAttempt, rebuild].filter(Boolean) },
      rebuiltAttempt: rebuild,
    });
    if (result) {
      setRebuildEvaluation(result.evaluation);
      setQuestions(result.questions);
      setStage("stress");
    }
  }

  async function finalizeSession(answers: string[]) {
    setAwaitingSummary(true);
    const result = await coachRequest<SessionSummary>({
      action: "complete_session",
      context: { ...context, stage: "complete", previousAttempts: [firstAttempt, rebuild, ...answers].filter(Boolean) },
      rebuiltAttempt: rebuild,
      stressAnswers: answers,
    });
    if (result) {
      setSummary(result);
      setStage("complete");
      setAwaitingSummary(false);
    }
  }

  async function submitStress(event?: FormEvent) {
    event?.preventDefault();
    if (!stressDraft.trim() || !questions[stressIndex]) return;
    const answer = stressDraft.trim();
    const result = await coachRequest<StressAnswerEvaluation>({
      action: "evaluate_stress",
      context: { ...context, stage: "stress" },
      question: questions[stressIndex],
      answer,
    });
    if (!result) return;

    const nextAnswers = [...stressAnswers, answer];
    setStressAnswers(nextAnswers);
    setStressEvaluations((current) => [...current, result]);
    setStressDraft("");
    setStressHint(0);
    if (stressIndex === questions.length - 1) {
      await finalizeSession(nextAnswers);
    } else {
      setStressIndex((current) => current + 1);
    }
  }

  function retryCurrent() {
    if (stage === "attempt") void analyzeAttempt();
    else if (stage === "rebuild") void evaluateRebuild();
    else if (stage === "stress" && awaitingSummary) void finalizeSession(stressAnswers);
    else if (stage === "stress") void submitStress();
  }

  function cancelRequest() { abortRef.current?.abort(); }

  function resetSession() {
    abortRef.current?.abort();
    setStage("mission"); setMission(""); setFirstAttempt(""); setRebuild("");
    setAnalysis(null); setRebuildEvaluation(null); setQuestions([]); setHintLevel(0);
    setStressIndex(0); setStressAnswers([]); setStressEvaluations([]); setStressDraft("");
    setStressHint(0); setSummary(null); setAwaitingSummary(false);
    setRequestState("idle"); setRequestError(null); setMeta(null);
  }

  return (
    <main className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" type="button" onClick={resetSession} aria-label="Start a new Language OS session"><span className="brand-mark">L/</span><span>LANGUAGE OS</span></button>
        <div className="topbar-actions"><Link href="/repeat">K-POP REPEAT STUDIO →</Link><div className={`provider-badge ${demoMode ? "demo" : "live"}`}><span /> {demoMode ? "DEMO COACH" : "LIVE COACH"}</div></div>
      </header>

      <aside className="stage-rail" aria-label="Session progress">
        <p className="rail-label">SESSION PROTOCOL</p>
        <ol>{stages.map((item, index) => <li key={item.id} className={index === activeIndex ? "active" : index < activeIndex ? "done" : ""}><span className="stage-number">{index < activeIndex ? "✓" : item.number}</span><span>{item.label}</span></li>)}</ol>
        <div className="rail-principle"><span>CORE DIRECTIVE</span><p>Attempt first.<br />Build what is missing.</p></div>
      </aside>

      <section className="work-area">
        <div className="mobile-progress"><span>{stages[activeIndex].number} / 06</span><div><i style={{ width: `${((activeIndex + 1) / stages.length) * 100}%` }} /></div><span>{stages[activeIndex].label}</span></div>
        {stage === "mission" && <StageFrame eyebrow="MISSION INPUT" title="What do you need to be able to say?" description="Start with a real thought—not a lesson topic. The more it matters to you, the more useful the training becomes."><form onSubmit={submitMission} className="stage-form"><label htmlFor="mission">YOUR INTENT</label><textarea id="mission" value={mission} onChange={(event) => setMission(event.target.value)} placeholder={exampleMission} rows={4} autoFocus /><button className="example-link" type="button" onClick={() => setMission(exampleMission)}>Use the example mission</button><label>TARGET LANGUAGE</label><div className="language-grid">{languages.map((item) => <button key={item.code} type="button" onClick={() => setLanguageCode(item.code)} className={languageCode === item.code ? "selected" : ""} aria-pressed={languageCode === item.code}><span>{item.nativeLabel}</span><small>{item.label}</small></button>)}</div><PrimaryButton disabled={!mission.trim()}>Enter the chamber</PrimaryButton></form></StageFrame>}

        {stage === "attempt" && <StageFrame eyebrow="FIRST ATTEMPT" title="Reach before you receive." description={`Express the mission in ${language.label}. Fragments, invented words, and mixed language are valid evidence. Imperfect is expected.`}><MissionCard mission={mission} language={language.nativeLabel} /><form onSubmit={submitAttempt} className="stage-form"><label htmlFor="first-attempt">YOUR UNASSISTED ATTEMPT</label><textarea id="first-attempt" value={firstAttempt} onChange={(event) => setFirstAttempt(event.target.value)} placeholder={languageCode === "ko" ? "아는 것부터 써 보세요…" : "Start with anything you know…"} rows={5} autoFocus lang={languageCode} disabled={isLoading} /><div className="permission-note"><span>◌</span><p><strong>No translation yet.</strong> This attempt tells the coach exactly what to build with you.</p></div>{requestError && <RequestError message={requestError} onRetry={retryCurrent} />}{isLoading ? <LoadingButton label="Analyzing the smallest gaps…" onCancel={cancelRequest} /> : <PrimaryButton disabled={!firstAttempt.trim()}>Analyze my attempt</PrimaryButton>}</form></StageFrame>}

        {stage === "scaffold" && analysis && <StageFrame eyebrow={`AI SCAFFOLDING · ${currentProvider === "mock" ? "DEMO COACH" : "LIVE COACH"}`} title="Build only what is missing." description={analysis.observation}><AttemptCard label="YOUR FIRST ATTEMPT" text={firstAttempt} /><div className="analysis-grid"><InfoPanel title="ALREADY WORKING" items={analysis.successes} tone="positive" /><InfoPanel title="SMALLEST GAPS" items={analysis.missingPieces} /></div><div className="hint-stack">{[1,2,3].map((level) => <div className={`hint-level ${hintLevel >= level ? "revealed" : ""}`} key={level}><div className="hint-heading"><span>LEVEL {level}</span><strong>{analysis.hints[level - 1].label}</strong></div>{hintLevel >= level ? <div className="hint-content"><p>{analysis.hints[level - 1].content}</p>{level === 3 && <ul>{analysis.breakdown.map((line) => <li key={line}>{line}</li>)}</ul>}</div> : <button type="button" onClick={() => setHintLevel(level)}>Reveal level {level}</button>}</div>)}</div><PrimaryButton onClick={() => { setRequestError(null); setStage("rebuild"); }} disabled={hintLevel === 0}>Rebuild the thought</PrimaryButton></StageFrame>}

        {stage === "rebuild" && analysis && <StageFrame eyebrow="REBUILD" title="Now make it yours." description="Use as little or as much scaffolding as you need. Retrieval—not copying perfectly—is the work."><div className="attempt-history"><AttemptCard label="ATTEMPT 01 · UNASSISTED" text={firstAttempt} />{hintLevel >= 3 && <AttemptCard label="COACH MODEL · REFERENCE" text={analysis.naturalVersion} muted />}</div><form onSubmit={evaluateRebuild} className="stage-form"><label htmlFor="rebuild">ATTEMPT 02 · REBUILT</label><textarea id="rebuild" value={rebuild} onChange={(event) => setRebuild(event.target.value)} placeholder="Build the thought again…" rows={5} autoFocus lang={languageCode} disabled={isLoading} />{requestError && <RequestError message={requestError} onRetry={retryCurrent} />}{isLoading ? <LoadingButton label="Checking meaning and preparing pressure…" onCancel={cancelRequest} /> : <PrimaryButton disabled={!rebuild.trim()}>Begin stress test</PrimaryButton>}</form></StageFrame>}

        {stage === "stress" && questions.length > 0 && <StageFrame eyebrow={`STRESS TEST · ${Math.min(stressIndex + 1, questions.length)} OF ${questions.length}`} title={awaitingSummary ? "Consolidating the session." : questions[stressIndex].target} description={awaitingSummary ? "Your responses are secure. The coach is preparing a capability summary." : questions[stressIndex].meaning} targetLanguage={languageCode}>{rebuildEvaluation && <div className="coach-note"><span>REBUILD CHECK</span><p>{rebuildEvaluation.progress}</p></div>}<div className="reuse-strip"><span>REUSE</span><p>{rebuild}</p></div>{!awaitingSummary && <form onSubmit={submitStress} className="stage-form"><label htmlFor="stress-answer">RESPOND IN {language.label.toUpperCase()}</label><textarea id="stress-answer" value={stressDraft} onChange={(event) => setStressDraft(event.target.value)} placeholder="Respond with one simple sentence…" rows={4} autoFocus lang={languageCode} disabled={isLoading} /><div className="stress-actions">{stressHint < questions[stressIndex].hints.length && <button className="hint-button" type="button" onClick={() => setStressHint((level) => level + 1)}>Need a hint</button>}{isLoading ? <LoadingButton label="Evaluating reuse…" onCancel={cancelRequest} compact /> : <PrimaryButton disabled={!stressDraft.trim()}>{stressIndex === questions.length - 1 ? "Complete session" : "Next question"}</PrimaryButton>}</div></form>}{stressHint > 0 && !awaitingSummary && <div className="inline-hints">{questions[stressIndex].hints.slice(0, stressHint).map((hint, index) => <p key={hint}><span>H{index + 1}</span>{hint}</p>)}</div>}{stressEvaluations.length > 0 && <div className="latest-evaluation"><span>LAST RESPONSE</span><p>{stressEvaluations.at(-1)?.feedback}</p></div>}{requestError && <RequestError message={requestError} onRetry={retryCurrent} />}{awaitingSummary && isLoading && <LoadingButton label="Creating your capability record…" onCancel={cancelRequest} />}</StageFrame>}

        {stage === "complete" && summary && <StageFrame eyebrow="SESSION COMPLETE" title="You can say something you could not say before." description="Capability secured. No score needed."><div className="completion-signal"><span>✓</span><div><small>NEW CAPABILITY</small><p>{summary.capability}</p></div></div><div className="summary-block"><SummaryRow label="ORIGINAL MISSION" value={mission} /><SummaryRow label="FIRST ATTEMPT" value={firstAttempt} /><SummaryRow label="FINAL VERSION" value={summary.improvedFinalVersion} accent /></div><div className="learning-grid"><section><h3>WORDS ACQUIRED</h3>{summary.words.map((word) => <p key={word.target}><strong>{word.target}</strong><span>{word.meaning}</span></p>)}</section><section><h3>PATTERNS ACQUIRED</h3>{summary.patterns.map((pattern) => <p key={pattern.pattern}><strong>{pattern.pattern}</strong><span>{pattern.meaning}</span></p>)}</section></div><div className="review-challenge"><span>NEXT SESSION · RETRIEVAL</span><p>{summary.reviewChallenge}</p></div><button className="secondary-button" type="button" onClick={resetSession}>Start a new mission</button></StageFrame>}

        {process.env.NODE_ENV === "development" && <Diagnostics provider={currentProvider} model={meta?.model ?? providerStatus?.model ?? "checking"} state={requestState} meta={meta} />}
      </section>
      <footer><span>LANGUAGE OS / PROTOTYPE 0.2</span><span>{demoMode ? "DEMO COACH · SAFE FALLBACK" : "LIVE COACH · SERVER SIDE"}</span></footer>
    </main>
  );
}

function StageFrame({ eyebrow, title, description, children, targetLanguage }: { eyebrow: string; title: string; description: string; children: React.ReactNode; targetLanguage?: string }) { return <div className="stage-frame"><p className="eyebrow">{eyebrow}</p><h1 lang={targetLanguage}>{title}</h1><p className="stage-description">{description}</p><div className="stage-content">{children}</div></div>; }
function PrimaryButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) { return <button className="primary-button" type={onClick ? "button" : "submit"} disabled={disabled} onClick={onClick}><span>{children}</span><b>→</b></button>; }
function LoadingButton({ label, onCancel, compact = false }: { label: string; onCancel: () => void; compact?: boolean }) { return <div className={`loading-control ${compact ? "compact" : ""}`} role="status"><span className="loading-pulse" /> <p>{label}</p><button type="button" onClick={onCancel}>Cancel</button></div>; }
function RequestError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="request-error" role="alert"><p>{message}</p><button type="button" onClick={onRetry}>Retry</button></div>; }
function MissionCard({ mission, language }: { mission: string; language: string }) { return <div className="mission-card"><span>MISSION / {language}</span><p>“{mission}”</p></div>; }
function AttemptCard({ label, text, muted = false }: { label: string; text: string; muted?: boolean }) { return <div className={`attempt-card ${muted ? "muted" : ""}`}><span>{label}</span><p>{text}</p></div>; }
function InfoPanel({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "neutral" | "positive" }) { return <section className={`info-panel ${tone}`}><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>; }
function SummaryRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span>{label}</span><p>{value}</p></div>; }
function Diagnostics({ provider, model, state, meta }: { provider: string; model: string; state: RequestState; meta: CoachMeta | null }) { return <details className="diagnostics"><summary>Development diagnostics</summary><dl><div><dt>Provider</dt><dd>{provider}</dd></div><div><dt>Model</dt><dd>{model}</dd></div><div><dt>Request</dt><dd>{state}</dd></div><div><dt>Response time</dt><dd>{meta ? `${meta.responseTimeMs} ms` : "—"}</dd></div><div><dt>Validation</dt><dd>{meta?.validationFailures.length ? meta.validationFailures.join(", ") : "none"}</dd></div><div><dt>Safe error</dt><dd>{meta?.error ?? "none"}</dd></div></dl></details>; }
