import { createRepeatSession, RepeatSessionSchema, splitLyrics } from "../repeat-studio/session";
import { createDemoSongAnalysis, ORIGINAL_DEMO } from "../song-analysis/demo";
import { LearnerMemoryRecordSchema, type LearnerMemoryRecord } from "./contracts";
import { ingestRepeatSession, recordRepeatLineEvidence } from "./repeat-integration";
import { createEmptyLearnerMemory } from "./repository";

export function createDemoLearnerMemory(): LearnerMemoryRecord {
  const startedAt = "2026-07-01T14:00:00.000Z";
  const request = {
    title: ORIGINAL_DEMO.title,
    artist: ORIGINAL_DEMO.artist,
    albumOrSource: ORIGINAL_DEMO.albumOrSource,
    personalNotes: ORIGINAL_DEMO.personalNotes,
    lines: splitLyrics(ORIGINAL_DEMO.lyrics),
  };
  const base = createRepeatSession(ORIGINAL_DEMO);
  const session = RepeatSessionSchema.parse({
    ...base,
    id: "demo-memory-repeat-session",
    startedAt,
    lastStudiedAt: "2026-07-27T14:00:00.000Z",
    analysis: createDemoSongAnalysis(request),
    analysisMeta: {
      provider: "mock",
      model: "language-os-song-demo-v1",
      demoMode: true,
      responseTimeMs: 0,
      validationFailures: [],
      error: null,
      liveProviderConfigured: false,
    },
    analysisStatus: "ready",
  });

  let record = ingestRepeatSession(createEmptyLearnerMemory(startedAt, "demo-learner-memory"), session);
  const firstLine = request.lines[0];
  const secondLine = request.lines[1];
  const baseInput = { session, sourceExcerpt: firstLine.text, lineId: firstLine.id };
  record = recordRepeatLineEvidence(record, { ...baseInput, actionId: "demo-listen-1", type: "listening_recognized", activityType: "repeat_listen", modality: "listening", result: "correct", occurredAt: "2026-07-03T14:00:00.000Z" });
  record = recordRepeatLineEvidence(record, { ...baseInput, actionId: "demo-recall-1", type: "recalled_without_hint", activityType: "repeat_rebuild", modality: "free_recall", result: "correct", hintLevel: "none", occurredAt: "2026-07-06T14:00:00.000Z" });
  record = recordRepeatLineEvidence(record, { ...baseInput, actionId: "demo-recall-2", type: "recalled_without_hint", activityType: "repeat_review", modality: "free_recall", result: "correct", hintLevel: "none", occurredAt: "2026-07-16T14:00:00.000Z" });
  record = recordRepeatLineEvidence(record, { ...baseInput, actionId: "demo-recall-3", type: "recalled_without_hint", activityType: "repeat_review", modality: "free_recall", result: "correct", hintLevel: "none", occurredAt: "2026-07-27T14:00:00.000Z" });
  record = recordRepeatLineEvidence(record, { ...baseInput, actionId: "demo-use-1", type: "usage_evaluated", activityType: "repeat_reuse", modality: "appropriate_usage", result: "correct", occurredAt: "2026-07-27T14:05:00.000Z" });
  record = recordRepeatLineEvidence(record, {
    session,
    sourceExcerpt: secondLine.text,
    lineId: secondLine.id,
    actionId: "demo-confusion-1",
    type: "item_marked_confusing",
    activityType: "repeat_unpack",
    modality: "comprehension",
    result: "not_evaluated",
    occurredAt: "2026-07-27T14:10:00.000Z",
  });
  record = recordRepeatLineEvidence(record, {
    session,
    sourceExcerpt: secondLine.text,
    lineId: secondLine.id,
    actionId: "demo-miss-1",
    type: "listening_missed",
    activityType: "repeat_listen",
    modality: "listening",
    result: "missed",
    occurredAt: "2026-07-27T14:11:00.000Z",
  });
  return LearnerMemoryRecordSchema.parse({ ...record, demoData: true, updatedAt: "2026-07-27T14:11:00.000Z" });
}
