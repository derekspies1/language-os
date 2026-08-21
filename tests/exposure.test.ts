import assert from "node:assert/strict";
import test from "node:test";
import { deriveItemKnowledge } from "../app/lib/learner-memory/service.ts";
import { createEmptyLearnerMemory } from "../app/lib/learner-memory/repository.ts";
import {
  createExposureSession,
  ingestExposureItems,
  recordCloseOutcome,
  recordInitialExposure,
  recordMeaningReveal,
} from "../app/lib/exposure/memory-integration.ts";
import {
  createLearningIntent,
  generateExposureFeed,
  inferInterestDomains,
} from "../app/lib/exposure/recommendation.ts";
import { InMemoryExposureRepository } from "../app/lib/exposure/repository.ts";
import { ExposureEvidenceInputSchema } from "../app/lib/exposure/contracts.ts";

const startedAt = "2026-08-08T14:00:00.000Z";

function createFixture(intentText = "Korean I might hear while watching LCK") {
  const intent = createLearningIntent(intentText, startedAt);
  const empty = createEmptyLearnerMemory(startedAt, "exposure-test");
  const generated = generateExposureFeed(empty, intent, { count: 12, now: startedAt });
  const record = ingestExposureItems(empty, generated.learningItems, startedAt);
  const session = createExposureSession(generated.snapshot, startedAt);
  return { intent, generated, record, session };
}

test("intent inference and feed generation stay deterministic and interest-led", () => {
  assert.deepEqual(inferInterestDomains("Korean for LCK and K-pop reactions"), ["lck", "gaming", "kpop", "reactions"]);
  const first = createFixture();
  const second = createFixture();
  assert.equal(first.generated.snapshot.items.length, 12);
  assert.deepEqual(first.generated.snapshot.items, second.generated.snapshot.items);
  assert.ok(first.generated.snapshot.items.some((item) => item.interestDomains.includes("lck") || item.interestDomains.includes("gaming")));
  assert.ok(first.generated.snapshot.items.every((item) => item.targetLanguage === "ko" && item.reasonText.length > 0));
  assert.equal(new Set(first.generated.snapshot.items.map((item) => item.id)).size, 12);
});

test("first-contact responses create evidence without claiming recall or usability", () => {
  const fixture = createFixture();
  const item = fixture.session.items[0];
  const responded = recordInitialExposure(fixture.record, fixture.session, item, "know", "2026-08-08T14:01:00.000Z");
  const itemEvents = responded.events.filter((event) => event.itemId === item.id);
  assert.deepEqual(itemEvents.map((event) => event.type), ["item_encountered", "reading_recognized"]);
  assert.equal(deriveItemKnowledge(responded, item.id, "2026-08-08T14:02:00.000Z").state, "recognizable");
  assert.ok(!itemEvents.some((event) => event.type === "recalled_without_hint" || event.type === "usage_evaluated"));
});

test("meaning reveals remain distinct from self-report and close-loop evidence", () => {
  const fixture = createFixture();
  const item = fixture.session.items[0];
  let record = recordMeaningReveal(fixture.record, fixture.session, item, "2026-08-08T14:01:00.000Z");
  record = recordInitialExposure(record, fixture.session, item, "new", "2026-08-08T14:02:00.000Z");
  record = recordCloseOutcome(record, fixture.session, item, "got_it", "2026-08-09T14:00:00.000Z");
  const itemEvents = record.events.filter((event) => event.itemId === item.id);
  assert.ok(itemEvents.some((event) => event.type === "meaning_revealed" && event.hintLevel === "answer_shown"));
  assert.ok(itemEvents.some((event) => event.type === "recalled_without_hint" && event.result === "correct"));
  assert.equal(deriveItemKnowledge(record, item.id, "2026-08-09T14:01:00.000Z").state, "recallable");
  assert.ok(itemEvents.every((event) => event.context.sourceType === "daily_exposure"));
});

test("recommendation reasons reflect weak and familiar graph evidence", () => {
  const weakFixture = createFixture();
  const weakItem = weakFixture.session.items[0];
  const weakRecord = recordInitialExposure(
    weakFixture.record,
    weakFixture.session,
    weakItem,
    "new",
    "2026-08-08T14:01:00.000Z",
  );
  const weakIntent = createLearningIntent(weakFixture.intent.text, "2026-08-09T15:00:00.000Z");
  const weakFeed = generateExposureFeed(weakRecord, weakIntent, { count: 12, now: "2026-08-09T15:00:00.000Z" });
  assert.equal(weakFeed.snapshot.items.find((item) => item.id === weakItem.id)?.reason, "previous_weak_encounter");

  const familiarFixture = createFixture("K-pop performances");
  const familiarItem = familiarFixture.session.items[0];
  let familiarRecord = recordInitialExposure(
    familiarFixture.record,
    familiarFixture.session,
    familiarItem,
    "familiar",
    "2026-08-08T14:01:00.000Z",
  );
  familiarRecord = recordCloseOutcome(
    familiarRecord,
    familiarFixture.session,
    familiarItem,
    "almost",
    "2026-08-08T15:00:00.000Z",
  );
  const familiarIntent = createLearningIntent(familiarFixture.intent.text, "2026-08-08T16:00:00.000Z");
  const familiarFeed = generateExposureFeed(familiarRecord, familiarIntent, { count: 12, now: "2026-08-08T16:00:00.000Z" });
  assert.equal(familiarFeed.snapshot.items.find((item) => item.id === familiarItem.id)?.reason, "reinforce_familiar_item");
});

test("later almost and didn't-stick outcomes preserve recognition versus recall", () => {
  const almostFixture = createFixture("K-pop performances");
  const almostItem = almostFixture.session.items[0];
  const almost = recordCloseOutcome(almostFixture.record, almostFixture.session, almostItem, "almost", "2026-08-09T14:00:00.000Z");
  assert.ok(almost.events.some((event) => event.itemId === almostItem.id && event.type === "reading_recognized" && event.result === "partial"));

  const missedFixture = createFixture("Everyday conversation");
  const missedItem = missedFixture.session.items[0];
  const missed = recordCloseOutcome(missedFixture.record, missedFixture.session, missedItem, "didnt_stick", "2026-08-09T14:00:00.000Z");
  assert.ok(missed.events.some((event) => event.itemId === missedItem.id && event.type === "recalled_without_hint" && event.result === "incorrect"));
  assert.notEqual(deriveItemKnowledge(missed, missedItem.id, "2026-08-09T14:01:00.000Z").state, "recallable");
});

test("exposure session persistence reopens the unfinished daily set", async () => {
  const fixture = createFixture();
  const repository = new InMemoryExposureRepository();
  await repository.save(fixture.session);
  const loaded = await repository.load();
  assert.equal(loaded.warning, null);
  assert.equal(loaded.sessions[0].id, fixture.session.id);
  assert.equal(loaded.sessions[0].status, "exposing");
  assert.equal(loaded.sessions[0].items.length, 12);
});

test("future clients can return device-neutral exposure evidence commands", () => {
  const fixture = createFixture();
  const itemId = fixture.session.items[0].id;
  assert.equal(ExposureEvidenceInputSchema.parse({
    schemaVersion: 1,
    sessionId: fixture.session.id,
    itemId,
    occurredAt: "2026-08-09T14:00:00.000Z",
    action: "close_outcome",
    outcome: "got_it",
  }).itemId, itemId);
  assert.equal(ExposureEvidenceInputSchema.safeParse({
    schemaVersion: 1,
    sessionId: fixture.session.id,
    itemId,
    occurredAt: "2026-08-09T14:00:00.000Z",
    action: "close_outcome",
    outcome: "mastered",
  }).success, false);
  assert.equal(ExposureEvidenceInputSchema.parse({
    schemaVersion: 1,
    sessionId: fixture.session.id,
    itemId,
    occurredAt: "2026-08-09T14:00:00.000Z",
    action: "audio_played",
    layer: "phrase",
  }).action, "audio_played");
});
