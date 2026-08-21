import type { LearnerMemoryRecord } from "../learner-memory/contracts";
import { deriveItemKnowledge } from "../learner-memory/service";
import type { SourcePack } from "./contracts";

const RECOGNITION_LEVELS = new Set(["supported", "reliable", "durable"]);

export function itemIdsForSourcePack(record: LearnerMemoryRecord, sourcePackId: string): string[] {
  return [...new Set(record.events
    .filter((event) => event.context.sourceType === "source_pack" && event.context.sessionId === sourcePackId)
    .map((event) => event.itemId))];
}

export function deriveSourcePackProgress(record: LearnerMemoryRecord, pack: SourcePack, now = new Date().toISOString()) {
  const itemIds = itemIdsForSourcePack(record, pack.id);
  const entries = itemIds.flatMap((itemId) => {
    const item = record.items.find((candidate) => candidate.id === itemId);
    return item ? [{ item, knowledge: deriveItemKnowledge(record, itemId, now) }] : [];
  });
  const recognizedReading = entries.filter(({ knowledge }) => RECOGNITION_LEVELS.has(knowledge.modalities.reading.level)).length;
  const recognizedListening = entries.filter(({ knowledge }) => RECOGNITION_LEVELS.has(knowledge.modalities.listening.level)).length;
  const phrasesUnderstandable = entries.filter(({ item, knowledge }) => ["multiword_expression", "reusable_phrase"].includes(item.type)
    && ["understood_in_context", "recognizable", "recallable", "usable", "durable"].includes(knowledge.state)).length;
  const weakOrUnexplored = entries.filter(({ knowledge }) => !RECOGNITION_LEVELS.has(knowledge.modalities.reading.level)
    || !RECOGNITION_LEVELS.has(knowledge.modalities.listening.level)).length;
  const sevenDaysAgo = new Date(new Date(now).getTime() - 7 * 86_400_000).getTime();
  const recentlyStrengthened = entries.filter(({ item, knowledge }) => knowledge.state !== "new" && record.events.some((event) => event.itemId === item.id
    && event.context.sourceType === "daily_exposure" && new Date(event.occurredAt).getTime() >= sevenDaysAgo)).length;
  return { totalItems: entries.length, encountered: entries.filter(({ knowledge }) => knowledge.evidenceCount > 0).length, recognizedReading, recognizedListening, weakOrUnexplored, phrasesUnderstandable, recentlyStrengthened };
}
