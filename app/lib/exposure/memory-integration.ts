import type { LearnerMemoryRecord, LearningEvidenceEvent, LearningItem } from "../learner-memory/contracts";
import { makeEvidenceId } from "../learner-memory/normalization";
import { upsertLearningGraph } from "../learner-memory/service";
import {
  EXPOSURE_SCHEMA_VERSION,
  ExposureSessionSchema,
  type CloseLoopOutcome,
  type ExposureFeedItem,
  type ExposureFeedSnapshot,
  type ExposureSession,
  type InitialExposureResponse,
} from "./contracts";

export function createExposureSession(snapshot: ExposureFeedSnapshot, now = snapshot.generatedAt): ExposureSession {
  return ExposureSessionSchema.parse({
    schemaVersion: EXPOSURE_SCHEMA_VERSION,
    id: `exposure_${snapshot.intent.id}_${now.slice(0, 10)}`,
    dateKey: now.slice(0, 10),
    intent: snapshot.intent,
    status: "exposing",
    items: snapshot.items.map((item) => ({
      ...item,
      meaningRevealed: false,
      initialResponse: null,
      initialRespondedAt: null,
      closeOutcome: null,
      closedAt: null,
      stateAfter: null,
      koreanRevealed: item.initialModality === "reading",
      initialComplete: false,
      audioPlayed: false,
    })),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  });
}

export function ingestExposureItems(record: LearnerMemoryRecord, items: LearningItem[], now: string): LearnerMemoryRecord {
  return upsertLearningGraph(record, { items, updatedAt: now });
}

function event(input: {
  session: ExposureSession;
  item: ExposureFeedItem;
  suffix: string;
  type: LearningEvidenceEvent["type"];
  activityType: string;
  occurredAt: string;
  modality?: LearningEvidenceEvent["modality"];
  result?: LearningEvidenceEvent["result"];
  hintLevel?: LearningEvidenceEvent["hintLevel"];
  metadata?: LearningEvidenceEvent["metadata"];
}): LearningEvidenceEvent {
  const dedupeKey = `daily-exposure:${input.session.id}:${input.item.id}:${input.suffix}`;
  return {
    id: makeEvidenceId(dedupeKey),
    dedupeKey,
    itemId: input.item.id,
    type: input.type,
    occurredAt: input.occurredAt,
    activityType: input.activityType,
    ...(input.modality ? { modality: input.modality } : {}),
    ...(input.result ? { result: input.result } : {}),
    ...(input.hintLevel ? { hintLevel: input.hintLevel } : {}),
    confidence: 0.9,
    context: {
      sessionId: input.session.id,
      sourceTitle: input.session.intent.text,
      sourceType: "daily_exposure",
      sourceReference: input.item.reason,
      ...(input.item.source?.sourceExcerpt ? { sourceExcerpt: input.item.source.sourceExcerpt } : {}),
      ...(input.item.source?.lineId ? { lineId: input.item.source.lineId } : {}),
    },
    aiGenerated: false,
    learnerConfirmed: true,
    metadata: {
      selectionReason: input.item.reason,
      interestDomains: input.item.interestDomains.join(","),
      sourcePackId: input.item.source?.sourcePackId ?? null,
      presentationModality: input.item.initialModality,
      ...input.metadata,
    },
  };
}

export function recordAudioPlayed(
  record: LearnerMemoryRecord,
  session: ExposureSession,
  item: ExposureFeedItem,
  layer: "word" | "phrase" | "micro_context",
  occurredAt = new Date().toISOString(),
): LearnerMemoryRecord {
  return upsertLearningGraph(record, { events: [event({
    session, item, suffix: `audio-${layer}`, type: "item_heard",
    activityType: "daily_exposure_audio", occurredAt, modality: "listening",
    result: "completed", metadata: { audioLayer: layer },
  })], updatedAt: occurredAt });
}

export function recordKoreanReveal(
  record: LearnerMemoryRecord,
  session: ExposureSession,
  item: ExposureFeedItem,
  occurredAt = new Date().toISOString(),
): LearnerMemoryRecord {
  return upsertLearningGraph(record, { events: [event({
    session, item, suffix: "korean-revealed", type: "item_read",
    activityType: "daily_exposure_text_reveal", occurredAt, modality: "reading",
    result: "completed", hintLevel: "answer_shown",
  })], updatedAt: occurredAt });
}

export function recordMeaningReveal(
  record: LearnerMemoryRecord,
  session: ExposureSession,
  item: ExposureFeedItem,
  occurredAt = new Date().toISOString(),
): LearnerMemoryRecord {
  return upsertLearningGraph(record, { events: [event({
    session, item, suffix: "meaning-revealed", type: "meaning_revealed",
    activityType: "daily_exposure_reveal", occurredAt, modality: "comprehension",
    result: "completed", hintLevel: "answer_shown",
  })], updatedAt: occurredAt });
}

export function recordInitialExposure(
  record: LearnerMemoryRecord,
  session: ExposureSession,
  item: ExposureFeedItem,
  response: InitialExposureResponse,
  occurredAt = new Date().toISOString(),
): LearnerMemoryRecord {
  const events: LearningEvidenceEvent[] = [event({
    session, item, suffix: "encountered", type: "item_encountered",
    activityType: "daily_exposure", occurredAt, modality: item.initialModality, result: "not_evaluated",
    metadata: { initialResponse: response },
  })];
  const recognitionType = item.initialModality === "listening" ? "listening_recognized" as const : "reading_recognized" as const;
  if (response === "know") events.push(event({
    session, item, suffix: "initial-know", type: recognitionType,
    activityType: "daily_exposure_self_report", occurredAt, modality: item.initialModality, result: "correct",
    metadata: { initialResponse: response },
  }));
  if (response === "familiar") events.push(event({
    session, item, suffix: "initial-familiar", type: recognitionType,
    activityType: "daily_exposure_self_report", occurredAt, modality: item.initialModality, result: "partial",
    metadata: { initialResponse: response },
  }));
  if (response === "new") events.push(event({
    session, item, suffix: "initial-new", type: item.initialModality === "listening" ? "listening_missed" : "reading_recognized",
    activityType: "daily_exposure_self_report", occurredAt, modality: item.initialModality, result: "missed",
    metadata: { initialResponse: response },
  }));
  return upsertLearningGraph(record, { events, updatedAt: occurredAt });
}

export function recordCloseOutcome(
  record: LearnerMemoryRecord,
  session: ExposureSession,
  item: ExposureFeedItem,
  outcome: CloseLoopOutcome,
  occurredAt = new Date().toISOString(),
): LearnerMemoryRecord {
  const mapping = {
    got_it: { type: "recalled_without_hint" as const, modality: "free_recall" as const, result: "correct" as const },
    almost: item.initialModality === "listening"
      ? { type: "listening_recognized" as const, modality: "listening" as const, result: "partial" as const }
      : { type: "reading_recognized" as const, modality: "reading" as const, result: "partial" as const },
    didnt_stick: { type: "recalled_without_hint" as const, modality: "free_recall" as const, result: "incorrect" as const },
  }[outcome];
  return upsertLearningGraph(record, { events: [
    event({
      session, item, suffix: "close-encounter", type: "item_encountered",
      activityType: "daily_exposure_loop_close", occurredAt, modality: item.initialModality,
      result: "not_evaluated", metadata: { closeOutcome: outcome },
    }),
    event({
      session, item, suffix: `close-${outcome}`, type: mapping.type,
      activityType: "daily_exposure_loop_close", occurredAt, modality: mapping.modality,
      result: mapping.result, hintLevel: "none", metadata: { closeOutcome: outcome },
    }),
  ], updatedAt: occurredAt });
}
