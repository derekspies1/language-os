import type { LearnerMemoryRecord, LearningItem } from "../learner-memory/contracts";
import { stableHash } from "../learner-memory/normalization";
import { deriveItemKnowledge } from "../learner-memory/service";
import type { SourcePack } from "../source-packs/contracts";
import {
  ExposureFeedSnapshotSchema,
  type ExposureFeedItem,
  type LearningIntent,
  type SelectionReason,
} from "./contracts";

const STRONG_LEVELS = new Set(["supported", "reliable", "durable"]);

export function createSourceLearningIntent(pack: SourcePack, now = new Date().toISOString()): LearningIntent {
  return {
    id: `intent_${stableHash(`${now.slice(0, 10)}\u0000${pack.id}`)}`,
    text: `Learn from ${pack.title}`,
    domains: ["music"],
    createdAt: now,
    sourcePackId: pack.id,
  };
}

function sourceOccurrences(record: LearnerMemoryRecord, sourcePackId: string) {
  return record.events.filter((event) => event.context.sourceType === "source_pack" && event.context.sessionId === sourcePackId);
}

function reasonFor(item: LearningItem, record: LearnerMemoryRecord, now: string): { reason: SelectionReason; modality: "reading" | "listening" } {
  const knowledge = deriveItemKnowledge(record, item.id, now);
  const readingStrong = STRONG_LEVELS.has(knowledge.modalities.reading.level);
  const listeningStrong = STRONG_LEVELS.has(knowledge.modalities.listening.level);
  if (readingStrong && !listeningStrong) return { reason: "listening_gap", modality: "listening" };
  if (listeningStrong && !readingStrong) return { reason: "reading_gap", modality: "reading" };
  if (readingStrong && listeningStrong && ["multiword_expression", "reusable_phrase"].includes(item.type)) {
    return { reason: "source_line_return", modality: "listening" };
  }
  if (!readingStrong && !listeningStrong) {
    const listening = Number.parseInt(stableHash(item.id).slice(0, 2), 36) % 2 === 0;
    return { reason: "cross_modal_pair", modality: listening ? "listening" : "reading" };
  }
  return { reason: "from_active_source", modality: "reading" };
}

function reasonText(reason: SelectionReason, title: string): string {
  switch (reason) {
    case "listening_gap": return `You recognize this on the page; now find it by sound inside ${title}.`;
    case "reading_gap": return `The sound has support, but the written form still needs contact.`;
    case "cross_modal_pair": return `Text and sound are both still forming for this item from ${title}.`;
    case "source_line_return": return `This is strengthening on its own; return it to its original source line.`;
    default: return `Selected directly from ${title}; no generic vocabulary was mixed in.`;
  }
}

function displayForm(item: LearningItem, sourceExcerpt: string): string {
  return item.forms.find((form) => form.kind !== "dictionary" && sourceExcerpt.includes(form.text))?.text
    ?? item.forms.find((form) => sourceExcerpt.includes(form.text))?.text
    ?? item.canonicalForm;
}

function conciseKorean(value: string, fallback: string): string {
  const clean = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return (clean || fallback).slice(0, 160);
}

export function generateSourceExposureFeed(
  record: LearnerMemoryRecord,
  pack: SourcePack,
  options: { count?: number; now?: string } = {},
) {
  if (!pack.analysis || !pack.analysisMeta) throw new Error("Source Pack analysis must be ready before exposure.");
  const now = options.now ?? new Date().toISOString();
  const count = Math.min(20, Math.max(1, options.count ?? 12));
  const occurrences = sourceOccurrences(record, pack.id);
  const firstOccurrence = new Map<string, (typeof occurrences)[number]>();
  for (const occurrence of occurrences) if (!firstOccurrence.has(occurrence.itemId)) firstOccurrence.set(occurrence.itemId, occurrence);

  const typeRank: Record<string, number> = { lemma: 0, multiword_expression: 1, reusable_phrase: 1, inflected_form: 2, grammar_pattern: 3 };
  const candidates = [...firstOccurrence.entries()]
    .map(([itemId, occurrence]) => ({ item: record.items.find((item) => item.id === itemId), occurrence }))
    .filter((entry): entry is { item: LearningItem; occurrence: (typeof occurrences)[number] } => Boolean(entry.item))
    .sort((left, right) => (typeRank[left.item.type] ?? 4) - (typeRank[right.item.type] ?? 4)
      || Number.parseInt(stableHash(`${pack.id}:${left.item.id}`).slice(0, 6), 36) - Number.parseInt(stableHash(`${pack.id}:${right.item.id}`).slice(0, 6), 36))
    .slice(0, count);

  const intent = createSourceLearningIntent(pack, now);
  const items: ExposureFeedItem[] = candidates.map(({ item, occurrence }) => {
    const knowledge = deriveItemKnowledge(record, item.id, now);
    const { reason, modality } = reasonFor(item, record, now);
    const sourceExcerpt = occurrence.context.sourceExcerpt ?? item.canonicalForm;
    const sourcePhrase = typeof occurrence.metadata.sourcePhrase === "string" ? occurrence.metadata.sourcePhrase : sourceExcerpt;
    const targetText = displayForm(item, sourceExcerpt);
    const phrase = conciseKorean(sourcePhrase, targetText);
    const microContext = conciseKorean(sourceExcerpt, phrase);
    return {
      id: item.id,
      targetLanguage: "ko",
      targetText,
      naturalMeaning: item.senses[0]?.gloss ?? "Meaning not yet described",
      usageClue: item.senses[0]?.usageNote ?? `From the line: ${sourceExcerpt}`,
      reason,
      reasonText: reasonText(reason, pack.title),
      learnerState: knowledge.state,
      interestDomains: ["music"],
      initialModality: modality,
      source: {
        sourcePackId: pack.id,
        title: pack.title,
        context: pack.context,
        lineId: occurrence.context.lineId ?? "line-unknown",
        sourceExcerpt,
      },
      audio: {
        word: conciseKorean(targetText, item.canonicalForm),
        phrase,
        ...(microContext !== phrase ? { microContext } : {}),
      },
    };
  });

  if (!items.length) throw new Error("This source did not produce an exposure-ready item.");
  return { snapshot: ExposureFeedSnapshotSchema.parse({ schemaVersion: 1, generatedAt: now, intent, items }), learningItems: candidates.map((entry) => entry.item) };
}
