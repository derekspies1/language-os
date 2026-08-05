"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepeatSession } from "../repeat-studio/session";
import type { LearnerMemoryRecord, LearningEvidenceEvent } from "./contracts";
import { LEARNER_MEMORY_STORAGE_KEY } from "./contracts";
import { ingestRepeatSession, recordRepeatLineEvidence } from "./repeat-integration";
import { BrowserLearnerMemoryRepository, createEmptyLearnerMemory } from "./repository";
import { updateItemNote } from "./service";

export function createInteractionId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function useLearnerMemory() {
  const repositoryRef = useRef<BrowserLearnerMemoryRepository | null>(null);
  const [record, setRecord] = useState<LearnerMemoryRecord>(() => createEmptyLearnerMemory());
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const repository = new BrowserLearnerMemoryRepository(window.localStorage);
    repositoryRef.current = repository;
    let active = true;
    void repository.load().then((result) => {
      if (!active) return;
      setRecord(result.record);
      setWarning(result.warning);
      setHydrated(true);
    }).catch(() => {
      if (!active) return;
      setWarning("Learner memory could not be opened. This page will keep working, but new evidence may not survive a refresh.");
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const repository = repositoryRef.current;
    if (!repository || !hydrated) return;
    void repository.save(record).catch(() => {
      setWarning("This browser could not save the latest learner-memory evidence. Your open activity still works.");
    });
  }, [hydrated, record]);

  useEffect(() => {
    const repository = repositoryRef.current;
    if (!repository) return;
    const loadedRepository = repository;
    function handleStorage(event: StorageEvent) {
      if (event.key !== LEARNER_MEMORY_STORAGE_KEY || !event.newValue) return;
      void loadedRepository.load().then((result) => {
        setRecord(result.record);
        setWarning(result.warning);
      });
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hydrated]);

  const ingestRepeatSessions = useCallback((sessions: RepeatSession[]) => {
    setRecord((current) => sessions.reduce((next, session) => ingestRepeatSession(next, session), current));
  }, []);

  const recordLineEvidence = useCallback((input: Parameters<typeof recordRepeatLineEvidence>[1]) => {
    setRecord((current) => recordRepeatLineEvidence(current, input));
  }, []);

  const setItemNote = useCallback((itemId: string, notes: string) => {
    setRecord((current) => updateItemNote(current, itemId, notes));
  }, []);

  const replaceRecord = useCallback((next: LearnerMemoryRecord) => setRecord(next), []);

  return {
    record,
    hydrated,
    warning,
    dismissWarning: () => setWarning(null),
    ingestRepeatSessions,
    recordLineEvidence,
    setItemNote,
    replaceRecord,
  };
}

export type RepeatEvidenceInput = {
  type: LearningEvidenceEvent["type"];
  modality?: LearningEvidenceEvent["modality"];
  result?: LearningEvidenceEvent["result"];
  hintLevel?: LearningEvidenceEvent["hintLevel"];
};
