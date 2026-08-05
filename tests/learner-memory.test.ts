import assert from "node:assert/strict";
import test from "node:test";
import type { CoachMeta } from "../app/lib/coaching/contracts.ts";
import {
  LearnerContextSummarySchema,
  LearnerMemoryRecordSchema,
  type LearningEvidenceEvent,
} from "../app/lib/learner-memory/contracts.ts";
import { createDemoLearnerMemory } from "../app/lib/learner-memory/demo.ts";
import {
  expandKoreanContraction,
  makeEvidenceId,
  makeLearningItemId,
  normalizeLearningForm,
} from "../app/lib/learner-memory/normalization.ts";
import {
  extractRepeatLearningGraph,
  ingestRepeatAnalysis,
  itemIdsForRepeatLine,
  recordRepeatLineEvidence,
} from "../app/lib/learner-memory/repeat-integration.ts";
import {
  createEmptyLearnerMemory,
  BrowserLearnerMemoryRepository,
  parseStoredLearnerMemory,
  serializeLearnerMemory,
} from "../app/lib/learner-memory/repository.ts";
import {
  appendEvidenceEvent,
  buildLearnerContextSummary,
  deriveItemKnowledge,
  exportLearnerMemoryCsv,
  exportLearnerMemoryJson,
  importLearnerMemoryJson,
  updateItemNote,
} from "../app/lib/learner-memory/service.ts";
import { createRepeatSession } from "../app/lib/repeat-studio/session.ts";
import { SongAnalysisSchema, type SongAnalysis } from "../app/lib/song-analysis/contracts.ts";

const meta: CoachMeta = {
  provider: "mock",
  model: "learner-memory-test",
  demoMode: false,
  responseTimeMs: 0,
  validationFailures: [],
  error: null,
  liveProviderConfigured: false,
};

function analysis(): SongAnalysis {
  return SongAnalysisSchema.parse({
    overview: "A two-line homonym test.",
    overallTone: "Neutral.",
    recurringIdeas: [],
    repeatedVocabulary: ["눈"],
    repeatedGrammar: [],
    stylisticFeatures: [],
    learningPriorities: ["Separate the senses."],
    lines: [
      {
        lineId: "line-001",
        originalKorean: "눈을 봤어",
        naturalMeaning: "I saw the snow.",
        structuralMeaning: "snow + object + saw",
        segments: [{ text: "눈을", meaning: "the snow (object)", role: "noun phrase" }, { text: "봤어", meaning: "saw" }],
        vocabulary: [
          { id: "v-snow", surfaceForm: "눈을", dictionaryForm: "눈", meaningInLine: "snow", broaderMeaning: "snow", partOfSpeech: "noun", reusability: "high", relatedForms: [] },
          { id: "v-see", surfaceForm: "봤어", dictionaryForm: "보다", meaningInLine: "saw", broaderMeaning: "to see", partOfSpeech: "verb", reusability: "high", relatedForms: ["봐요"] },
        ],
        grammar: [{ id: "g-object", formAsUsed: "을", basePattern: "N을/를", functionInLine: "marks the object", explanation: "Object particle." }],
        listeningCue: "Listen for the contraction in 봤어.",
        nuance: "Casual.",
        reviewPriority: "high",
      },
      {
        lineId: "line-002",
        originalKorean: "눈이 아파",
        naturalMeaning: "My eye hurts.",
        structuralMeaning: "eye + subject + hurts",
        segments: [{ text: "눈이", meaning: "the eye (subject)", role: "noun phrase" }, { text: "아파", meaning: "hurts" }],
        vocabulary: [
          { id: "v-eye", surfaceForm: "눈이", dictionaryForm: "눈", meaningInLine: "eye", broaderMeaning: "eye", partOfSpeech: "noun", reusability: "high", relatedForms: [] },
          { id: "v-hurt", surfaceForm: "아파", dictionaryForm: "아프다", meaningInLine: "hurts", partOfSpeech: "adjective", reusability: "high", relatedForms: [] },
        ],
        grammar: [{ id: "g-subject", formAsUsed: "이", basePattern: "N이/가", functionInLine: "marks the subject", explanation: "Subject particle." }],
        listeningCue: "Hear 눈이 as one unit.",
        nuance: "Casual.",
        reviewPriority: "medium",
      },
    ],
    partial: false,
    omittedLineIds: [],
  });
}

const repeatInput = {
  sessionId: "session-memory-test",
  title: "Sense Test",
  artist: "Language OS",
  albumOrSource: "Test fixture",
  startedAt: "2026-07-01T12:00:00.000Z",
  analysis: analysis(),
  analysisMeta: meta,
};

function event(recordItemId: string, input: Partial<LearningEvidenceEvent> & Pick<LearningEvidenceEvent, "dedupeKey" | "type" | "occurredAt">): LearningEvidenceEvent {
  return {
    id: makeEvidenceId(input.dedupeKey),
    dedupeKey: input.dedupeKey,
    itemId: recordItemId,
    type: input.type,
    occurredAt: input.occurredAt,
    activityType: input.activityType ?? "test_review",
    modality: input.modality,
    result: input.result,
    hintLevel: input.hintLevel,
    confidence: input.confidence ?? 1,
    context: input.context ?? { sourceType: "review" },
    aiGenerated: false,
    learnerConfirmed: true,
    metadata: input.metadata ?? {},
  };
}

test("Korean normalization is deterministic while display forms remain separate", () => {
  assert.equal(normalizeLearningForm("ko", "multiword_expression", "  눈을   봤어! "), "눈을봤어");
  assert.equal(expandKoreanContraction("거야"), "것이야");
  assert.equal(normalizeLearningForm("ko", "inflected_form", "거야"), normalizeLearningForm("ko", "inflected_form", "것이야"));
  assert.equal(makeLearningItemId("ko", "lemma", "보다"), makeLearningItemId("ko", "lemma", " 보다 "));
  assert.notEqual(makeLearningItemId("ko", "lemma", "보다"), makeLearningItemId("ko", "inflected_form", "보다"));
});

test("Repeat extraction separates senses, stores forms, and creates typed relationships", () => {
  const graph = extractRepeatLearningGraph(repeatInput);
  const eyeOrSnow = graph.items.find((item) => item.id === makeLearningItemId("ko", "lemma", "눈"));
  assert.ok(eyeOrSnow);
  assert.deepEqual(new Set(eyeOrSnow.senses.map((sense) => sense.gloss)), new Set(["snow", "eye"]));
  assert.ok(eyeOrSnow.forms.some((form) => form.text === "눈을"));
  assert.ok(eyeOrSnow.forms.some((form) => form.text === "눈이"));

  const seenForm = graph.items.find((item) => item.type === "inflected_form" && item.canonicalForm === "봤어");
  const seeLemma = graph.items.find((item) => item.type === "lemma" && item.canonicalForm === "보다");
  assert.ok(seenForm && seeLemma);
  assert.ok(graph.relationships.some((relationship) => relationship.sourceItemId === seenForm.id && relationship.targetItemId === seeLemma.id && relationship.type === "inflected_form_of"));
  assert.ok(graph.relationships.every((relationship) => relationship.status === "suggested" && relationship.confidence > 0));
});

test("analysis ingestion is idempotent across retries and repeated renders", () => {
  const empty = createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "test-record");
  const first = ingestRepeatAnalysis(empty, repeatInput);
  const second = ingestRepeatAnalysis(first, repeatInput);
  assert.equal(second.items.length, first.items.length);
  assert.equal(second.relationships.length, first.relationships.length);
  assert.equal(second.events.length, first.events.length);
  assert.equal(new Set(second.events.map((item) => item.dedupeKey)).size, second.events.length);
  assert.doesNotThrow(() => LearnerMemoryRecordSchema.parse(second));
});

test("derived knowledge stays modality-specific and does not equate exposure or production attempts with usable", () => {
  let record = ingestRepeatAnalysis(createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "state-test"), repeatInput);
  const itemId = makeLearningItemId("ko", "lemma", "보다");
  assert.equal(deriveItemKnowledge(record, itemId, "2026-07-01T13:00:00.000Z").state, "new");

  record = appendEvidenceEvent(record, event(itemId, { dedupeKey: "meaning", type: "meaning_guessed", occurredAt: "2026-07-02T12:00:00.000Z", modality: "comprehension", result: "correct" }));
  assert.equal(deriveItemKnowledge(record, itemId, "2026-07-02T13:00:00.000Z").state, "understood_in_context");

  record = appendEvidenceEvent(record, event(itemId, { dedupeKey: "listen", type: "listening_recognized", occurredAt: "2026-07-03T12:00:00.000Z", modality: "listening", result: "correct" }));
  assert.equal(deriveItemKnowledge(record, itemId, "2026-07-03T13:00:00.000Z").state, "recognizable");

  record = appendEvidenceEvent(record, event(itemId, { dedupeKey: "recall", type: "item_reconstructed", occurredAt: "2026-07-04T12:00:00.000Z", modality: "free_recall", result: "correct", hintLevel: "none" }));
  record = appendEvidenceEvent(record, event(itemId, { dedupeKey: "production", type: "learner_created_sentence", occurredAt: "2026-07-05T12:00:00.000Z", modality: "production", result: "completed" }));
  const recallable = deriveItemKnowledge(record, itemId, "2026-07-05T13:00:00.000Z");
  assert.equal(recallable.state, "recallable");
  assert.equal(recallable.modalities.listening.level, "supported");
  assert.equal(recallable.modalities.reading.level, "none");

  record = appendEvidenceEvent(record, event(itemId, { dedupeKey: "usage", type: "usage_evaluated", occurredAt: "2026-07-06T12:00:00.000Z", modality: "appropriate_usage", result: "correct" }));
  assert.equal(deriveItemKnowledge(record, itemId, "2026-07-06T13:00:00.000Z").state, "usable");
});

test("durable evidence requires repeated successes across distinct days and remains explainable", () => {
  let record = ingestRepeatAnalysis(createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "durable-test"), repeatInput);
  const itemId = makeLearningItemId("ko", "lemma", "보다");
  for (const [index, occurredAt] of ["2026-07-02T12:00:00.000Z", "2026-07-10T12:00:00.000Z", "2026-07-20T12:00:00.000Z"].entries()) {
    record = appendEvidenceEvent(record, event(itemId, { dedupeKey: `durable-${index}`, type: "recalled_without_hint", occurredAt, modality: "free_recall", result: "correct", hintLevel: "none" }));
  }
  const knowledge = deriveItemKnowledge(record, itemId, "2026-07-21T12:00:00.000Z");
  assert.equal(knowledge.state, "durable");
  assert.equal(knowledge.modalities.free_recall.level, "durable");
  assert.match(knowledge.modalities.free_recall.explanation, /3 successful attempts across 3 days/);
});

test("Repeat actions fan out to line items once while retaining source context", () => {
  const base = createRepeatSession({ title: "Sense Test", artist: "Language OS", lyrics: "눈을 봤어\n눈이 아파", albumOrSource: "Test fixture" });
  let record = ingestRepeatAnalysis(createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "repeat-action-test"), { ...repeatInput, sessionId: base.id });
  const itemIds = itemIdsForRepeatLine(record, base.id, "line-001");
  assert.ok(itemIds.length > 2);
  const action = {
    session: base,
    lineId: "line-001",
    sourceExcerpt: "눈을 봤어",
    actionId: "same-listen-request",
    type: "item_heard" as const,
    activityType: "repeat_return_listen",
    modality: "listening" as const,
    result: "completed" as const,
  };
  record = recordRepeatLineEvidence(record, action);
  const count = record.events.length;
  record = recordRepeatLineEvidence(record, action);
  assert.equal(record.events.length, count);
  assert.ok(record.events.filter((entry) => entry.dedupeKey.includes("same-listen-request")).every((entry) => entry.context.sourceExcerpt === "눈을 봤어"));
});

test("notes are preserved during later graph upserts and never silently overwritten", () => {
  const first = ingestRepeatAnalysis(createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "notes-test"), repeatInput);
  const itemId = makeLearningItemId("ko", "lemma", "눈");
  const noted = updateItemNote(first, itemId, "Snow in line one, eye in line two.", "2026-07-02T12:00:00.000Z");
  const reingested = ingestRepeatAnalysis(noted, { ...repeatInput, startedAt: "2026-07-03T12:00:00.000Z" });
  assert.equal(reingested.items.find((item) => item.id === itemId)?.notes, "Snow in line one, eye in line two.");
});

test("versioned storage round-trips and migrates schema version 1 without dropping meanings", () => {
  const record = ingestRepeatAnalysis(createEmptyLearnerMemory("2026-07-01T12:00:00.000Z", "round-trip"), repeatInput);
  const roundTrip = parseStoredLearnerMemory(serializeLearnerMemory(record));
  assert.equal(roundTrip.warning, null);
  assert.equal(roundTrip.record.items.length, record.items.length);
  assert.equal(roundTrip.recoveryRequired, false);

  const item = record.items[0];
  const v1 = {
    schemaVersion: 1,
    recordId: "old-memory",
    items: [{ id: item.id, language: item.language, type: item.type, canonicalForm: item.canonicalForm, normalizedForm: item.normalizedForm, meanings: ["first meaning", "second meaning"], notes: "keep me", createdAt: item.createdAt, updatedAt: item.updatedAt }],
    events: [{ id: "old-event", dedupeKey: "old-event", itemId: item.id, type: "item_encountered", occurredAt: item.createdAt }],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  const migrated = parseStoredLearnerMemory(JSON.stringify(v1));
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.record.schemaVersion, 2);
  assert.equal(migrated.record.items[0].senses.length, 2);
  assert.equal(migrated.record.items[0].notes, "keep me");

  const invalid = parseStoredLearnerMemory("{bad json");
  assert.equal(invalid.recoveryRequired, true);
  assert.match(invalid.warning ?? "", /invalid/i);
});

test("browser persistence preserves invalid original bytes before replacing the primary record", async () => {
  const values = new Map<string, string>([["language-os.learner-memory.graph", "{broken memory"]]);
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  const repository = new BrowserLearnerMemoryRepository(storage);
  const loaded = await repository.load();
  assert.equal(loaded.recoveryRequired, true);
  assert.equal(values.get("language-os.learner-memory.graph.recovery"), "{broken memory");
  await repository.save(loaded.record);
  assert.doesNotThrow(() => JSON.parse(values.get("language-os.learner-memory.graph") ?? ""));
  assert.equal(values.get("language-os.learner-memory.graph.recovery"), "{broken memory");
});

test("complete and human-readable exports validate and contain evidence-backed state", () => {
  const record = createDemoLearnerMemory();
  const json = exportLearnerMemoryJson(record);
  assert.doesNotThrow(() => LearnerMemoryRecordSchema.parse(JSON.parse(json)));
  assert.equal(importLearnerMemoryJson(json).recordId, record.recordId);
  const csv = exportLearnerMemoryCsv(record, "2026-08-03T12:00:00.000Z");
  assert.match(csv, /^canonical_form,language,item_type,learner_state/);
  assert.match(csv, /durable/);
  assert.match(csv, /due_for_reinforcement/);
});

test("learner context summaries are bounded and exclude private excerpts, notes, and event history", () => {
  const record = createDemoLearnerMemory();
  const summary = buildLearnerContextSummary(record, { language: "ko", purpose: "Adapt a Repeat Studio explanation", maxItems: 4, relevantForms: ["새벽"] , now: "2026-08-03T12:00:00.000Z" });
  assert.doesNotThrow(() => LearnerContextSummarySchema.parse(summary));
  assert.ok(summary.known.length <= 4 && summary.developing.length <= 4 && summary.confusing.length <= 4);
  assert.deepEqual(summary.privacy, { sourceExcerptsIncluded: false, eventHistoryIncluded: false, notesIncluded: false });
  assert.doesNotMatch(JSON.stringify(summary), /demo-memory-repeat-session/);
  assert.doesNotMatch(JSON.stringify(summary), /불 꺼진 창에 새벽이 번져|Snow in line one|what still feels unstable/i);
});
