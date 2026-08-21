"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLearnerMemory } from "../learner-memory/use-learner-memory";
import { deriveItemKnowledge } from "../learner-memory/service";
import {
  type CloseLoopOutcome,
  type ExposureSession,
  ExposureSessionSchema,
  type ExposureSummary,
  type InitialExposureResponse,
} from "./contracts";
import {
  createExposureSession,
  ingestExposureItems,
  recordCloseOutcome,
  recordAudioPlayed,
  recordInitialExposure,
  recordKoreanReveal,
  recordMeaningReveal,
} from "./memory-integration";
import { createLearningIntent, generateExposureFeed } from "./recommendation";
import { generateSourceExposureFeed } from "./source-recommendation";
import { BrowserExposureRepository } from "./repository";
import type { SourcePack } from "../source-packs/contracts";

function initialComplete(item: ExposureSession["items"][number]): boolean {
  return item.initialComplete ?? Boolean(item.initialResponse);
}

export function useDailyExposure() {
  const memory = useLearnerMemory();
  const repositoryRef = useRef<BrowserExposureRepository | null>(null);
  const [session, setSession] = useState<ExposureSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const repository = new BrowserExposureRepository(window.localStorage);
    repositoryRef.current = repository;
    let active = true;
    void repository.load().then(({ sessions, warning: loadedWarning }) => {
      if (!active) return;
      const current = sessions.find((candidate) => candidate.status !== "complete") ?? sessions[0] ?? null;
      setSession(current);
      setWarning(loadedWarning);
      setHydrated(true);
    }).catch(() => {
      if (!active) return;
      setWarning("Today’s exposure set could not be reopened. Learner memory remains available.");
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const saveSession = useCallback((next: ExposureSession) => {
    const validated = ExposureSessionSchema.parse(next);
    setSession(validated);
    void repositoryRef.current?.save(validated).catch(() => {
      setWarning("This exposure set is still open, but the latest session change could not be saved.");
    });
    return validated;
  }, []);

  const start = useCallback((intentText: string) => {
    if (!memory.hydrated) return;
    const now = new Date().toISOString();
    const intent = createLearningIntent(intentText, now);
    const { snapshot, learningItems } = generateExposureFeed(memory.record, intent, { count: 12, now });
    const nextRecord = ingestExposureItems(memory.record, learningItems, now);
    memory.replaceRecord(nextRecord);
    saveSession(createExposureSession(snapshot, now));
  }, [memory, saveSession]);

  const startFromSource = useCallback((pack: SourcePack) => {
    if (!memory.hydrated || !pack.analysis || !pack.analysisMeta) return;
    const now = new Date().toISOString();
    const { snapshot, learningItems } = generateSourceExposureFeed(memory.record, pack, { count: 12, now });
    memory.replaceRecord(ingestExposureItems(memory.record, learningItems, now));
    saveSession(createExposureSession(snapshot, now));
  }, [memory, saveSession]);

  const reveal = useCallback(() => {
    if (!session || session.status !== "exposing") return;
    const index = session.items.findIndex((item) => !initialComplete(item));
    const item = session.items[index];
    if (!item || item.meaningRevealed) return;
    const now = new Date().toISOString();
    memory.replaceRecord(recordMeaningReveal(memory.record, session, item, now));
    saveSession({ ...session, items: session.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, meaningRevealed: true } : candidate), updatedAt: now });
  }, [memory, saveSession, session]);

  const revealKorean = useCallback(() => {
    if (!session || session.status !== "exposing") return;
    const index = session.items.findIndex((item) => !initialComplete(item));
    const item = session.items[index];
    if (!item || item.koreanRevealed) return;
    const now = new Date().toISOString();
    memory.replaceRecord(recordKoreanReveal(memory.record, session, item, now));
    saveSession({ ...session, items: session.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, koreanRevealed: true } : candidate), updatedAt: now });
  }, [memory, saveSession, session]);

  const audioPlayed = useCallback((layer: "word" | "phrase" | "micro_context") => {
    if (!session || (session.status !== "exposing" && session.status !== "closing")) return;
    const index = session.status === "exposing"
      ? session.items.findIndex((item) => !initialComplete(item))
      : session.items.findIndex((item) => !item.closeOutcome);
    const item = session.items[index];
    if (!item) return;
    const now = new Date().toISOString();
    memory.replaceRecord(recordAudioPlayed(memory.record, session, item, layer, now));
    saveSession({ ...session, items: session.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, audioPlayed: true } : candidate), updatedAt: now });
  }, [memory, saveSession, session]);

  const respond = useCallback((response: InitialExposureResponse) => {
    if (!session || session.status !== "exposing") return;
    const index = session.items.findIndex((item) => !initialComplete(item));
    const item = session.items[index];
    if (!item || item.initialResponse) return;
    const now = new Date().toISOString();
    memory.replaceRecord(recordInitialExposure(memory.record, session, item, response, now));
    const items = session.items.map((candidate, itemIndex) => itemIndex === index
      ? { ...candidate, initialResponse: response, initialRespondedAt: now, initialComplete: candidate.initialModality === "reading" }
      : candidate);
    const finished = items.every(initialComplete);
    saveSession({ ...session, items, status: finished ? "awaiting_close" : "exposing", updatedAt: now });
  }, [memory, saveSession, session]);

  const continueInitial = useCallback(() => {
    if (!session || session.status !== "exposing") return;
    const index = session.items.findIndex((item) => !initialComplete(item));
    const item = session.items[index];
    if (!item?.initialResponse || (item.initialModality === "listening" && !item.koreanRevealed)) return;
    const now = new Date().toISOString();
    const items = session.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, initialComplete: true } : candidate);
    const finished = items.every(initialComplete);
    saveSession({ ...session, items, status: finished ? "awaiting_close" : "exposing", updatedAt: now });
  }, [saveSession, session]);

  const beginClose = useCallback(() => {
    if (!session || session.status === "complete") return;
    saveSession({ ...session, status: "closing", updatedAt: new Date().toISOString() });
  }, [saveSession, session]);

  const closeItem = useCallback((outcome: CloseLoopOutcome) => {
    if (!session || session.status !== "closing") return;
    const index = session.items.findIndex((item) => !item.closeOutcome);
    const item = session.items[index];
    if (!item) return;
    const now = new Date().toISOString();
    const nextRecord = recordCloseOutcome(memory.record, session, item, outcome, now);
    const stateAfter = deriveItemKnowledge(nextRecord, item.id, now).state;
    memory.replaceRecord(nextRecord);
    const items = session.items.map((candidate, itemIndex) => itemIndex === index
      ? { ...candidate, closeOutcome: outcome, closedAt: now, stateAfter }
      : candidate);
    const finished = items.every((candidate) => candidate.closeOutcome);
    saveSession({ ...session, items, status: finished ? "complete" : "closing", updatedAt: now, completedAt: finished ? now : null });
  }, [memory, saveSession, session]);

  const currentIndex = useMemo(() => {
    if (!session) return -1;
    if (session.status === "exposing") return session.items.findIndex((item) => !initialComplete(item));
    if (session.status === "closing") return session.items.findIndex((item) => !item.closeOutcome);
    return -1;
  }, [session]);

  const summary = useMemo<ExposureSummary | null>(() => {
    if (!session || session.status !== "complete") return null;
    return {
      exposed: session.items.filter((item) => item.initialResponse).length,
      laterRecognized: session.items.filter((item) => item.closeOutcome === "got_it" || item.closeOutcome === "almost").length,
      meaningsRetrieved: session.items.filter((item) => item.closeOutcome === "got_it").length,
      remainFamiliar: session.items.filter((item) => item.closeOutcome === "almost").length,
      stillWeak: session.items.filter((item) => item.closeOutcome === "didnt_stick").length,
    };
  }, [session]);

  return {
    session,
    item: currentIndex >= 0 ? session?.items[currentIndex] ?? null : null,
    currentIndex,
    summary,
    hydrated: hydrated && memory.hydrated,
    warning: warning ?? memory.warning,
    dismissWarning: () => { setWarning(null); memory.dismissWarning(); },
    start,
    startFromSource,
    reveal,
    revealKorean,
    audioPlayed,
    respond,
    continueInitial,
    beginClose,
    closeItem,
  };
}
