import assert from "node:assert/strict";
import test from "node:test";
import type { CoachMeta } from "../app/lib/coaching/contracts.ts";
import {
  createExposureSession,
  recordAudioPlayed,
  recordInitialExposure,
  recordKoreanReveal,
} from "../app/lib/exposure/memory-integration.ts";
import { generateSourceExposureFeed } from "../app/lib/exposure/source-recommendation.ts";
import {
  extractRepeatLearningGraph,
  ingestSourcePackAnalysis,
} from "../app/lib/learner-memory/repeat-integration.ts";
import { createEmptyLearnerMemory } from "../app/lib/learner-memory/repository.ts";
import { createDemoSongAnalysis, ORIGINAL_DEMO } from "../app/lib/song-analysis/demo.ts";
import {
  createSourcePack,
  sourcePackAnalysisRequest,
  SourcePackSchema,
} from "../app/lib/source-packs/contracts.ts";
import { deriveSourcePackProgress } from "../app/lib/source-packs/progress.ts";
import { InMemorySourcePackRepository } from "../app/lib/source-packs/repository.ts";

const now = "2026-08-08T12:00:00.000Z";
const meta: CoachMeta = {
  provider: "mock",
  model: "source-pack-test",
  demoMode: true,
  responseTimeMs: 0,
  validationFailures: [],
  error: null,
  liveProviderConfigured: false,
};

function readySource() {
  const pack = createSourcePack({
    title: "Magnetic source",
    context: "Personal song fragment",
    koreanText: ORIGINAL_DEMO.lyrics.split("\n")[0],
  }, now);
  const analysis = createDemoSongAnalysis(sourcePackAnalysisRequest(pack));
  return SourcePackSchema.parse({ ...pack, analysis, analysisMeta: meta, analysisStatus: "ready", updatedAt: now });
}

function ingestedSource() {
  const pack = readySource();
  const record = ingestSourcePackAnalysis(createEmptyLearnerMemory(now, "source-memory"), {
    sessionId: pack.id,
    title: pack.title,
    artist: pack.context,
    albumOrSource: "Learner-pasted Source Pack",
    startedAt: pack.createdAt,
    analysis: pack.analysis!,
    analysisMeta: pack.analysisMeta!,
  });
  return { pack, record };
}

test("Source Packs validate learner text and persist their analyzed structure", async () => {
  const pack = readySource();
  assert.equal(pack.lines.length, 1);
  assert.equal(pack.lines[0].text, ORIGINAL_DEMO.lyrics.split("\n")[0]);
  const repository = new InMemorySourcePackRepository();
  await repository.save(pack);
  const loaded = await repository.load();
  assert.equal(loaded.warning, null);
  assert.equal(loaded.packs[0].analysisStatus, "ready");
  assert.equal(loaded.packs[0].koreanText, pack.koreanText);
});

test("source analysis enters the shared graph with source and line provenance", () => {
  const { pack, record } = ingestedSource();
  assert.ok(record.items.length > 0);
  const sourceEvents = record.events.filter((event) => event.context.sourceType === "source_pack");
  assert.ok(sourceEvents.length > 0);
  assert.ok(sourceEvents.every((event) => event.context.sessionId === pack.id && event.context.lineId === "line-001"));
  assert.ok(sourceEvents.every((event) => event.context.sourceExcerpt === pack.lines[0].text));

  const sharedIdentity = extractRepeatLearningGraph({
    sessionId: "repeat-version",
    title: pack.title,
    artist: pack.context,
    startedAt: pack.createdAt,
    analysis: pack.analysis!,
    analysisMeta: pack.analysisMeta!,
  });
  assert.deepEqual(new Set(record.items.map((item) => item.id)), new Set(sharedIdentity.items.map((item) => item.id)));
});

test("source exposure contains only source-linked items and retains machine-readable reasons", () => {
  const { pack, record } = ingestedSource();
  const generated = generateSourceExposureFeed(record, pack, { count: 12, now });
  const sourceItemIds = new Set(record.events.filter((event) => event.context.sourceType === "source_pack").map((event) => event.itemId));
  assert.ok(generated.snapshot.items.length > 0);
  assert.ok(generated.snapshot.items.every((item) => sourceItemIds.has(item.id)));
  assert.ok(generated.snapshot.items.every((item) => item.source?.sourcePackId === pack.id));
  assert.ok(generated.snapshot.items.every((item) => item.audio?.word && item.audio.phrase));
  assert.ok(generated.snapshot.items.every((item) => ["from_active_source", "listening_gap", "reading_gap", "cross_modal_pair", "source_line_return"].includes(item.reason)));
});

test("reading and listening recognition strengthen separate source modalities", () => {
  const { pack, record: base } = ingestedSource();
  const generated = generateSourceExposureFeed(base, pack, { count: 12, now });
  const original = generated.snapshot.items[0];
  const readingSnapshot = { ...generated.snapshot, items: [{ ...original, initialModality: "reading" as const }] };
  const readingSession = createExposureSession(readingSnapshot, now);
  let record = recordInitialExposure(base, readingSession, readingSession.items[0], "know", "2026-08-08T12:10:00.000Z");
  let progress = deriveSourcePackProgress(record, pack, "2026-08-08T12:11:00.000Z");
  assert.equal(progress.recognizedReading, 1);
  assert.equal(progress.recognizedListening, 0);
  const adapted = generateSourceExposureFeed(record, pack, { count: 12, now: "2026-08-08T12:12:00.000Z" });
  const adaptedItem = adapted.snapshot.items.find((item) => item.id === original.id);
  assert.equal(adaptedItem?.reason, "listening_gap");
  assert.equal(adaptedItem?.initialModality, "listening");

  const listeningTime = "2026-08-09T12:00:00.000Z";
  const listeningSnapshot = { ...generated.snapshot, generatedAt: listeningTime, intent: { ...generated.snapshot.intent, id: `${generated.snapshot.intent.id}_listen`, createdAt: listeningTime }, items: [{ ...original, initialModality: "listening" as const }] };
  const listeningSession = createExposureSession(listeningSnapshot, listeningTime);
  record = recordInitialExposure(record, listeningSession, listeningSession.items[0], "know", "2026-08-09T12:10:00.000Z");
  progress = deriveSourcePackProgress(record, pack, "2026-08-09T12:11:00.000Z");
  assert.equal(progress.recognizedReading, 1);
  assert.equal(progress.recognizedListening, 1);
});

test("audio playback and Korean reveal remain contact events, not recognition", () => {
  const { pack, record: base } = ingestedSource();
  const generated = generateSourceExposureFeed(base, pack, { count: 12, now });
  const item = { ...generated.snapshot.items[0], initialModality: "listening" as const };
  const session = createExposureSession({ ...generated.snapshot, items: [item] }, now);
  let record = recordAudioPlayed(base, session, item, "word", "2026-08-08T12:01:00.000Z");
  record = recordKoreanReveal(record, session, item, "2026-08-08T12:02:00.000Z");
  const events = record.events.filter((event) => event.itemId === item.id && event.context.sourceType === "daily_exposure");
  assert.ok(events.some((event) => event.type === "item_heard" && event.modality === "listening"));
  assert.ok(events.some((event) => event.type === "item_read" && event.modality === "reading" && event.hintLevel === "answer_shown"));
  assert.ok(!events.some((event) => event.type === "listening_recognized" || event.type === "reading_recognized"));
});
