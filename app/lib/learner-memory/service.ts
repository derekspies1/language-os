import {
  DerivedItemKnowledgeSchema,
  LearnerContextSummarySchema,
  LearnerMemoryRecordSchema,
  type DerivedItemKnowledge,
  type EvidenceEventType,
  type ItemRelationship,
  type LearnerContextSummary,
  type LearnerMemoryRecord,
  type LearnerState,
  type LearningEvidenceEvent,
  type LearningItem,
  type LearningModality,
  type ModalityStrength,
} from "./contracts";
import { makeEvidenceId } from "./normalization";

const MODALITIES: LearningModality[] = [
  "listening",
  "reading",
  "comprehension",
  "cued_recall",
  "free_recall",
  "production",
  "appropriate_usage",
  "pronunciation",
];

const SUCCESS_RESULTS = new Set(["correct", "completed"]);
const MISS_RESULTS = new Set(["incorrect", "missed"]);
const STRONG_EVENT_TYPES = new Set<EvidenceEventType>([
  "listening_recognized",
  "reading_recognized",
  "item_reconstructed",
  "recalled_with_hint",
  "recalled_without_hint",
  "usage_evaluated",
  "pronunciation_evaluated",
  "review_completed",
]);

function timeOf(value: string): number {
  return new Date(value).getTime();
}

function dayOf(value: string): string {
  return value.slice(0, 10);
}

function maxStatus(current: LearningItem["forms"][number]["status"], incoming: LearningItem["forms"][number]["status"]) {
  if (current === "learner_confirmed" || current === "rejected") return current;
  if (incoming === "learner_confirmed" || incoming === "rejected") return incoming;
  return current === "system_confirmed" || incoming === "system_confirmed" ? "system_confirmed" : "suggested";
}

export function mergeLearningItem(current: LearningItem, incoming: LearningItem): LearningItem {
  if (current.id !== incoming.id) throw new Error("Cannot merge learning items with different identities.");
  const forms = [...current.forms];
  for (const form of incoming.forms) {
    const index = forms.findIndex((candidate) => candidate.normalized === form.normalized && candidate.kind === form.kind);
    if (index < 0) forms.push(form);
    else forms[index] = { ...forms[index], status: maxStatus(forms[index].status, form.status), confidence: Math.max(forms[index].confidence, form.confidence) };
  }
  const senses = [...current.senses];
  for (const sense of incoming.senses) {
    const index = senses.findIndex((candidate) => candidate.id === sense.id);
    if (index < 0) senses.push(sense);
    else senses[index] = { ...senses[index], status: maxStatus(senses[index].status, sense.status), confidence: Math.max(senses[index].confidence, sense.confidence) };
  }
  return {
    ...current,
    forms,
    senses,
    notes: current.notes,
    updatedAt: timeOf(incoming.updatedAt) > timeOf(current.updatedAt) ? incoming.updatedAt : current.updatedAt,
  };
}

export function upsertLearningGraph(
  record: LearnerMemoryRecord,
  input: { items?: LearningItem[]; relationships?: ItemRelationship[]; events?: LearningEvidenceEvent[]; updatedAt?: string },
): LearnerMemoryRecord {
  const items = [...record.items];
  for (const incoming of input.items ?? []) {
    const index = items.findIndex((item) => item.id === incoming.id);
    if (index < 0) items.push(incoming);
    else items[index] = mergeLearningItem(items[index], incoming);
  }

  const relationships = [...record.relationships];
  const relationshipIds = new Set(relationships.map((relationship) => relationship.id));
  for (const relationship of input.relationships ?? []) {
    if (!relationshipIds.has(relationship.id)) {
      relationships.push(relationship);
      relationshipIds.add(relationship.id);
    }
  }

  const events = [...record.events];
  const eventIds = new Set(events.map((event) => event.id));
  const dedupeKeys = new Set(events.map((event) => event.dedupeKey));
  for (const event of input.events ?? []) {
    if (!eventIds.has(event.id) && !dedupeKeys.has(event.dedupeKey)) {
      events.push(event);
      eventIds.add(event.id);
      dedupeKeys.add(event.dedupeKey);
    }
  }

  return LearnerMemoryRecordSchema.parse({
    ...record,
    items,
    relationships,
    events,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
}

export function appendEvidenceEvent(record: LearnerMemoryRecord, event: Omit<LearningEvidenceEvent, "id"> & { id?: string }): LearnerMemoryRecord {
  if (record.events.some((candidate) => candidate.dedupeKey === event.dedupeKey || (event.id && candidate.id === event.id))) return record;
  const complete = { ...event, id: event.id ?? makeEvidenceId(event.dedupeKey) } as LearningEvidenceEvent;
  return upsertLearningGraph(record, { events: [complete], updatedAt: event.occurredAt });
}

function modalityStrength(modality: LearningModality, events: LearningEvidenceEvent[]): ModalityStrength {
  const relevant = events.filter((event) => event.modality === modality);
  const successes = relevant.filter((event) => SUCCESS_RESULTS.has(event.result ?? "") && (STRONG_EVENT_TYPES.has(event.type) || event.type === "learner_created_sentence"));
  const misses = relevant.filter((event) => MISS_RESULTS.has(event.result ?? ""));
  const distinctDays = new Set(successes.map((event) => dayOf(event.occurredAt))).size;
  const spanMs = successes.length > 1 ? timeOf(successes.at(-1)!.occurredAt) - timeOf(successes[0].occurredAt) : 0;
  let level: ModalityStrength["level"] = "none";
  if (relevant.length > 0) level = "emerging";
  if (successes.length >= 1) level = "supported";
  if (successes.length >= 2 && distinctDays >= 2) level = "reliable";
  if (successes.length >= 3 && distinctDays >= 3 && spanMs >= 14 * 86_400_000) level = "durable";
  if (misses.length > successes.length && level !== "none") level = "emerging";

  const explanation = level === "none"
    ? "No direct evidence yet."
    : level === "emerging"
      ? `${relevant.length} contact${relevant.length === 1 ? "" : "s"}; successful retrieval is not established yet.`
      : `${successes.length} successful attempt${successes.length === 1 ? "" : "s"} across ${distinctDays} day${distinctDays === 1 ? "" : "s"}${misses.length ? `, with ${misses.length} miss${misses.length === 1 ? "" : "es"}` : ""}.`;

  return {
    modality,
    level,
    evidenceCount: relevant.length,
    successfulAttempts: successes.length,
    misses: misses.length,
    distinctDays,
    lastEvidenceAt: relevant.at(-1)?.occurredAt ?? null,
    explanation,
  };
}

function hasSuccessfulEvent(events: LearningEvidenceEvent[], types: EvidenceEventType[]): boolean {
  return events.some((event) => types.includes(event.type) && SUCCESS_RESULTS.has(event.result ?? ""));
}

function reinforcementIntervalDays(state: LearnerState): number {
  return {
    new: 1,
    encountered: 2,
    familiar: 4,
    understood_in_context: 7,
    recognizable: 10,
    recallable: 18,
    usable: 30,
    durable: 60,
  }[state];
}

export function deriveItemKnowledge(record: LearnerMemoryRecord, itemId: string, now = new Date().toISOString()): DerivedItemKnowledge {
  const events = record.events.filter((event) => event.itemId === itemId).sort((a, b) => timeOf(a.occurredAt) - timeOf(b.occurredAt));
  const encounters = events.filter((event) => event.type === "item_encountered");
  const distinctSessions = new Set(encounters.map((event) => event.context.sessionId).filter(Boolean)).size;
  const strengths = Object.fromEntries(MODALITIES.map((modality) => [modality, modalityStrength(modality, events)])) as Record<LearningModality, ModalityStrength>;
  const hasDurableModality = Object.values(strengths).some((strength) => strength.level === "durable");
  const usedSuccessfully = hasSuccessfulEvent(events, ["usage_evaluated"]);
  const productionAttempted = events.some((event) => event.type === "learner_created_sentence" && event.result === "completed");
  const recalled = hasSuccessfulEvent(events, ["recalled_without_hint", "item_reconstructed"]);
  const recognized = hasSuccessfulEvent(events, ["listening_recognized", "reading_recognized"]);
  const understood = hasSuccessfulEvent(events, ["meaning_guessed"]);

  let state: LearnerState = "new";
  const firstContactIsRecent = encounters[0] ? timeOf(now) - timeOf(encounters[0].occurredAt) <= 86_400_000 : false;
  if (encounters.length > 1 || distinctSessions > 1) state = "familiar";
  else if (encounters.length === 1 && !firstContactIsRecent) state = "encountered";
  if (understood) state = "understood_in_context";
  if (recognized) state = "recognizable";
  if (recalled) state = "recallable";
  if (usedSuccessfully) state = "usable";
  if (hasDurableModality) state = "durable";

  const firstEncounterAt = encounters[0]?.occurredAt ?? events[0]?.occurredAt ?? null;
  const lastEncounterAt = events.at(-1)?.occurredAt ?? null;
  const nextReinforcementAt = lastEncounterAt
    ? new Date(timeOf(lastEncounterAt) + reinforcementIntervalDays(state) * 86_400_000).toISOString()
    : null;
  const dueForReinforcement = nextReinforcementAt ? timeOf(nextReinforcementAt) <= timeOf(now) : false;
  const weakening = dueForReinforcement && ["understood_in_context", "recognizable", "recallable", "usable", "durable"].includes(state);
  const confusingEvents = events.filter((event) => event.type === "item_marked_confusing");
  const confusing = confusingEvents.length > 0 && confusingEvents.at(-1)?.result !== "completed";
  const explanation = [
    encounters.length ? `${encounters.length} encounter${encounters.length === 1 ? "" : "s"} across ${Math.max(1, distinctSessions)} source session${distinctSessions === 1 ? "" : "s"}.` : "No encounter evidence has been recorded.",
    understood ? "Contextual meaning evidence is present." : "No supported meaning-comprehension event yet.",
    recognized ? "At least one recognition event is present." : "Recognition has not been directly demonstrated yet.",
    recalled ? "At least one independent retrieval or reconstruction succeeded." : "Independent recall has not been demonstrated yet.",
    usedSuccessfully ? "Appropriate usage has supporting evidence." : productionAttempted ? "The learner attempted personal production; appropriateness is not yet evaluated." : "No production evidence yet.",
    ...(confusing ? ["The learner marked this item or its source line as confusing."] : []),
    ...(dueForReinforcement ? [`The transparent review interval for ${state.replaceAll("_", " ")} evidence has elapsed.`] : []),
  ];

  return DerivedItemKnowledgeSchema.parse({
    itemId,
    state,
    firstEncounterAt,
    lastEncounterAt,
    evidenceCount: events.length,
    encounterCount: encounters.length,
    distinctSessions,
    modalities: strengths,
    confusing,
    dueForReinforcement,
    weakening,
    nextReinforcementAt,
    explanation,
  });
}

export function updateItemNote(record: LearnerMemoryRecord, itemId: string, notes: string, occurredAt = new Date().toISOString()): LearnerMemoryRecord {
  const items = record.items.map((item) => item.id === itemId ? { ...item, notes: notes.slice(0, 4_000), updatedAt: occurredAt } : item);
  if (!items.some((item) => item.id === itemId)) return record;
  return LearnerMemoryRecordSchema.parse({ ...record, items, updatedAt: occurredAt });
}

export function buildLearnerContextSummary(
  record: LearnerMemoryRecord,
  input: { language: string; purpose: string; relevantForms?: string[]; maxItems?: number; now?: string },
): LearnerContextSummary {
  const now = input.now ?? new Date().toISOString();
  const maxItems = Math.min(20, Math.max(1, input.maxItems ?? 12));
  const normalizedRelevant = new Set((input.relevantForms ?? []).map((value) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase()));
  const candidates = record.items
    .filter((item) => item.language.toLowerCase().startsWith(input.language.toLowerCase()))
    .map((item) => ({ item, knowledge: deriveItemKnowledge(record, item.id, now) }))
    .sort((a, b) => {
      const aRelevant = normalizedRelevant.has(a.item.normalizedForm.toLowerCase()) ? 1 : 0;
      const bRelevant = normalizedRelevant.has(b.item.normalizedForm.toLowerCase()) ? 1 : 0;
      return bRelevant - aRelevant || timeOf(b.knowledge.lastEncounterAt ?? b.item.updatedAt) - timeOf(a.knowledge.lastEncounterAt ?? a.item.updatedAt);
    });

  const mapItem = ({ item, knowledge }: (typeof candidates)[number]) => ({
    itemId: item.id,
    canonicalForm: item.canonicalForm,
    itemType: item.type,
    state: knowledge.state,
    meanings: item.senses.slice(0, 3).map((sense) => sense.gloss),
    supportedModalities: MODALITIES.filter((modality) => ["supported", "reliable", "durable"].includes(knowledge.modalities[modality].level)),
    reason: knowledge.explanation.slice(0, 2).join(" "),
  });

  return LearnerContextSummarySchema.parse({
    schemaVersion: 1,
    language: input.language,
    generatedAt: now,
    purpose: input.purpose,
    known: candidates.filter(({ knowledge }) => ["recognizable", "recallable", "usable", "durable"].includes(knowledge.state)).slice(0, maxItems).map(mapItem),
    developing: candidates.filter(({ knowledge }) => ["new", "encountered", "familiar", "understood_in_context"].includes(knowledge.state)).slice(0, maxItems).map(mapItem),
    confusing: candidates.filter(({ knowledge }) => knowledge.confusing).slice(0, Math.min(12, maxItems)).map(mapItem),
    privacy: { sourceExcerptsIncluded: false, eventHistoryIncluded: false, notesIncluded: false },
  });
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportLearnerMemoryJson(record: LearnerMemoryRecord): string {
  return JSON.stringify(LearnerMemoryRecordSchema.parse(record), null, 2);
}

export function importLearnerMemoryJson(raw: string): LearnerMemoryRecord {
  const decoded: unknown = JSON.parse(raw);
  return LearnerMemoryRecordSchema.parse(decoded);
}

export function exportLearnerMemoryCsv(record: LearnerMemoryRecord, now = new Date().toISOString()): string {
  const rows = [["canonical_form", "language", "item_type", "learner_state", "meanings", "encounters", "evidence_events", "first_encounter", "last_evidence", "due_for_reinforcement", "notes"]];
  for (const item of record.items) {
    const knowledge = deriveItemKnowledge(record, item.id, now);
    rows.push([
      item.canonicalForm,
      item.language,
      item.type,
      knowledge.state,
      item.senses.map((sense) => sense.gloss).join(" | "),
      String(knowledge.encounterCount),
      String(knowledge.evidenceCount),
      knowledge.firstEncounterAt ?? "",
      knowledge.lastEncounterAt ?? "",
      String(knowledge.dueForReinforcement),
      item.notes,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
