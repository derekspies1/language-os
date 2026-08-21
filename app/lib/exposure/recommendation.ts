import type { LearnerMemoryRecord, LearnerState, LearningItem } from "../learner-memory/contracts";
import { makeLearningItemId, makeSenseId, normalizeLearningForm, normalizeMeaning, stableHash } from "../learner-memory/normalization";
import { deriveItemKnowledge } from "../learner-memory/service";
import {
  ExposureFeedSnapshotSchema,
  type ExposureFeedItem,
  type InterestDomain,
  type LearningIntent,
  type SelectionReason,
} from "./contracts";
import { KOREAN_EXPOSURE_SEEDS, type ExposureSeed } from "./seed";

const DEFAULT_INTENT = "Give me Korean";

export function inferInterestDomains(text: string): InterestDomain[] {
  const value = text.normalize("NFKC").toLowerCase();
  const domains = new Set<InterestDomain>();
  if (/\blck\b|league of legends|리그|롤\b/.test(value)) { domains.add("lck"); domains.add("gaming"); }
  if (/game|gaming|esports|게임/.test(value)) domains.add("gaming");
  if (/k[- ]?pop|idol|아이돌/.test(value)) domains.add("kpop");
  if (/song|music|performance|dance|concert|노래|음악|무대/.test(value)) domains.add("music");
  if (/react|reaction|funny|youtube|웃|반응/.test(value)) domains.add("reactions");
  if (/everyday|conversation|daily|일상|대화/.test(value)) domains.add("everyday");
  if (!domains.size) { domains.add("general"); domains.add("everyday"); }
  return [...domains];
}

export function createLearningIntent(text: string, now = new Date().toISOString()): LearningIntent {
  const clean = text.trim() || DEFAULT_INTENT;
  return {
    id: `intent_${stableHash(`${now.slice(0, 10)}\u0000${clean.toLowerCase()}`)}`,
    text: clean,
    domains: inferInterestDomains(clean),
    createdAt: now,
  };
}

export function learningItemFromSeed(seed: ExposureSeed, now: string): LearningItem {
  const id = makeLearningItemId("ko", "lemma", seed.dictionaryForm);
  const provenance = { origin: "system" as const, source: "daily-exposure-seed-v1", createdAt: now };
  return {
    id,
    language: "ko",
    type: "lemma",
    canonicalForm: seed.dictionaryForm,
    normalizedForm: normalizeLearningForm("ko", "lemma", seed.dictionaryForm),
    forms: [{
      text: seed.korean,
      normalized: normalizeLearningForm("ko", "lemma", seed.korean),
      kind: seed.korean === seed.dictionaryForm ? "dictionary" : "surface",
      status: "system_confirmed",
      confidence: 1,
      provenance,
    }],
    senses: [{
      id: makeSenseId(id, "ko", seed.meaning),
      gloss: seed.meaning,
      normalizedGloss: normalizeMeaning("ko", seed.meaning),
      usageNote: seed.clue,
      status: "system_confirmed",
      confidence: 1,
      provenance,
      createdAt: now,
    }],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

type Candidate = {
  seed: ExposureSeed;
  item: LearningItem;
  state: LearnerState;
  exists: boolean;
  due: boolean;
  confusing: boolean;
  topicMatch: boolean;
  reason: SelectionReason;
  rank: number;
};

function reasonText(reason: SelectionReason, intent: LearningIntent): string {
  switch (reason) {
    case "previous_weak_encounter": return "You have seen this before, but the evidence is still weak.";
    case "reinforce_familiar_item": return "This looks familiar; another light contact can strengthen it.";
    case "related_to_known_word": return `A useful neighbor of Korean already in your memory, connected to ${intent.text}.`;
    case "new_exploration": return "A useful new word outside the center of today’s neighborhood.";
    default: return `Suggested because you’re exploring: ${intent.text}.`;
  }
}

function deterministicRank(seed: ExposureSeed, intent: LearningIntent, dateKey: string): number {
  return Number.parseInt(stableHash(`${dateKey}:${intent.id}:${seed.key}`).slice(0, 6), 36);
}

export function generateExposureFeed(
  record: LearnerMemoryRecord,
  intent: LearningIntent,
  options: { count?: number; now?: string } = {},
) {
  const now = options.now ?? new Date().toISOString();
  const count = Math.min(20, Math.max(10, options.count ?? 12));
  const intentDomains = new Set(intent.domains);
  const knownDomains = new Set<InterestDomain>();
  for (const seed of KOREAN_EXPOSURE_SEEDS) {
    const itemId = makeLearningItemId("ko", "lemma", seed.dictionaryForm);
    if (!record.items.some((item) => item.id === itemId)) continue;
    const state = deriveItemKnowledge(record, itemId, now).state;
    if (["recognizable", "recallable", "usable", "durable"].includes(state)) seed.domains.forEach((domain) => knownDomains.add(domain));
  }

  const candidates: Candidate[] = KOREAN_EXPOSURE_SEEDS.map((seed) => {
    const item = learningItemFromSeed(seed, now);
    const exists = record.items.some((candidate) => candidate.id === item.id);
    const knowledge = exists ? deriveItemKnowledge(record, item.id, now) : null;
    const topicMatch = seed.domains.some((domain) => intentDomains.has(domain));
    const relatedToKnown = !exists && seed.domains.some((domain) => knownDomains.has(domain));
    let reason: SelectionReason = topicMatch ? "related_to_current_interest" : "new_exploration";
    if (knowledge && knowledge.evidenceCount > 0 && (knowledge.confusing || knowledge.dueForReinforcement || ["new", "encountered"].includes(knowledge.state))) reason = "previous_weak_encounter";
    else if (knowledge && ["familiar", "understood_in_context"].includes(knowledge.state)) reason = "reinforce_familiar_item";
    else if (relatedToKnown) reason = "related_to_known_word";
    return {
      seed,
      item,
      state: knowledge?.state ?? "new",
      exists,
      due: knowledge?.dueForReinforcement ?? false,
      confusing: knowledge?.confusing ?? false,
      topicMatch,
      reason,
      rank: deterministicRank(seed, intent, now.slice(0, 10)),
    };
  });

  const byRank = (left: Candidate, right: Candidate) => left.rank - right.rank;
  const buckets = [
    candidates.filter((candidate) => candidate.reason === "previous_weak_encounter").sort(byRank).slice(0, 4),
    candidates.filter((candidate) => candidate.reason === "reinforce_familiar_item").sort(byRank).slice(0, 3),
    candidates.filter((candidate) => candidate.reason === "related_to_known_word").sort(byRank).slice(0, 2),
    candidates.filter((candidate) => candidate.topicMatch && !candidate.exists).sort(byRank),
    candidates.filter((candidate) => !candidate.topicMatch && !candidate.exists).sort(byRank),
    candidates.filter((candidate) => candidate.exists).sort(byRank),
  ];
  const chosen: Candidate[] = [];
  const chosenIds = new Set<string>();
  for (const bucket of buckets) {
    for (const candidate of bucket) {
      if (chosen.length >= count) break;
      if (!chosenIds.has(candidate.item.id)) { chosen.push(candidate); chosenIds.add(candidate.item.id); }
    }
  }

  const items: ExposureFeedItem[] = chosen.map((candidate) => ({
    id: candidate.item.id,
    targetLanguage: "ko",
    targetText: candidate.seed.korean,
    naturalMeaning: candidate.seed.meaning,
    usageClue: candidate.seed.clue,
    reason: candidate.reason,
    reasonText: reasonText(candidate.reason, intent),
    learnerState: candidate.state,
    interestDomains: candidate.seed.domains,
    initialModality: "reading",
  }));

  return {
    snapshot: ExposureFeedSnapshotSchema.parse({ schemaVersion: 1, generatedAt: now, intent, items }),
    learningItems: chosen.map((candidate) => candidate.item),
  };
}
