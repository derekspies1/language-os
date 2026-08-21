import type { CoachMeta } from "../coaching/contracts";
import type { RepeatSession } from "../repeat-studio/session";
import type { SongAnalysis, SongGrammar, SongLineAnalysis, SongVocabulary } from "../song-analysis/contracts";
import {
  type EvidenceEventType,
  type ItemForm,
  type ItemRelationship,
  type LearnerMemoryRecord,
  type LearningEvidenceEvent,
  type LearningItem,
  type LearningItemType,
  type LearningModality,
  type Provenance,
} from "./contracts";
import {
  getNormalizationAdapter,
  makeEvidenceId,
  makeLearningItemId,
  makeRelationshipId,
  makeSenseId,
  normalizeLearningForm,
  normalizeMeaning,
} from "./normalization";
import { mergeLearningItem, upsertLearningGraph } from "./service";

export type LearningSourceAnalysisInput = {
  sessionId: string;
  title: string;
  artist: string;
  albumOrSource?: string;
  startedAt: string;
  analysis: SongAnalysis;
  analysisMeta: CoachMeta;
  language?: string;
  sourceKind?: "repeat_studio" | "source_pack";
};

type ExtractedOccurrence = {
  itemId: string;
  senseId?: string;
  lineId: string;
  sourceExcerpt: string;
  sourcePhrase: string;
  role: "lemma" | "form" | "grammar" | "expression";
};

export type ExtractedRepeatGraph = {
  items: LearningItem[];
  relationships: ItemRelationship[];
  occurrences: ExtractedOccurrence[];
};

function provenance(input: LearningSourceAnalysisInput): Provenance {
  return {
    origin: input.analysisMeta.provider === "openai" ? "ai" : "system",
    source: input.sourceKind === "source_pack" ? "source-pack-analysis" : "repeat-studio-analysis",
    provider: input.analysisMeta.provider,
    model: input.analysisMeta.model,
    createdAt: input.startedAt,
  };
}

function form(
  language: string,
  itemType: LearningItemType,
  text: string,
  kind: ItemForm["kind"],
  source: Provenance,
  confidence: number,
): ItemForm {
  return {
    text,
    normalized: normalizeLearningForm(language, itemType, text),
    kind,
    status: "suggested",
    confidence,
    provenance: source,
  };
}

function learningItem(input: {
  language: string;
  type: LearningItemType;
  canonicalForm: string;
  gloss: string;
  usageNote?: string;
  forms: ItemForm[];
  source: Provenance;
  confidence: number;
  createdAt: string;
}): LearningItem {
  const id = makeLearningItemId(input.language, input.type, input.canonicalForm);
  const normalizedGloss = normalizeMeaning(input.language, input.gloss);
  return {
    id,
    language: input.language,
    type: input.type,
    canonicalForm: input.canonicalForm.normalize("NFKC").trim().replace(/\s+/g, " "),
    normalizedForm: normalizeLearningForm(input.language, input.type, input.canonicalForm),
    forms: input.forms,
    senses: [{
      id: makeSenseId(id, input.language, input.gloss),
      gloss: input.gloss,
      normalizedGloss,
      ...(input.usageNote ? { usageNote: input.usageNote } : {}),
      status: "suggested",
      confidence: input.confidence,
      provenance: input.source,
      createdAt: input.createdAt,
    }],
    notes: "",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function vocabularyItems(language: string, vocabulary: SongVocabulary, source: Provenance, createdAt: string) {
  const confidence = source.origin === "ai" ? 0.78 : 0.92;
  const adapter = getNormalizationAdapter(language);
  const lemmaType = "lemma" as const;
  const lemma = learningItem({
    language,
    type: lemmaType,
    canonicalForm: vocabulary.dictionaryForm,
    gloss: vocabulary.meaningInLine,
    usageNote: [vocabulary.broaderMeaning, vocabulary.nuance].filter(Boolean).join(" ") || undefined,
    forms: [
      form(language, lemmaType, vocabulary.dictionaryForm, "dictionary", source, confidence),
      form(language, lemmaType, vocabulary.surfaceForm, adapter.suggestSurfaceKind(vocabulary.surfaceForm, vocabulary.dictionaryForm), source, confidence),
      ...vocabulary.relatedForms.map((value) => form(language, lemmaType, value, "other", source, confidence * 0.9)),
    ],
    source,
    confidence,
    createdAt,
  });

  const surfaceDiffers = normalizeLearningForm(language, "inflected_form", vocabulary.surfaceForm)
    !== normalizeLearningForm(language, "inflected_form", vocabulary.dictionaryForm);
  if (!surfaceDiffers) return { lemma, surface: null };

  const surface = learningItem({
    language,
    type: "inflected_form",
    canonicalForm: vocabulary.surfaceForm,
    gloss: vocabulary.meaningInLine,
    usageNote: `Form encountered for ${vocabulary.dictionaryForm}.`,
    forms: [form(language, "inflected_form", vocabulary.surfaceForm, adapter.suggestSurfaceKind(vocabulary.surfaceForm, vocabulary.dictionaryForm), source, confidence)],
    source,
    confidence,
    createdAt,
  });
  return { lemma, surface };
}

function grammarItem(language: string, grammar: SongGrammar, source: Provenance, createdAt: string): LearningItem {
  const confidence = source.origin === "ai" ? 0.75 : 0.92;
  return learningItem({
    language,
    type: "grammar_pattern",
    canonicalForm: grammar.basePattern,
    gloss: grammar.functionInLine,
    usageNote: [grammar.explanation, grammar.nearbyAlternative ? `Contrast: ${grammar.nearbyAlternative}` : ""].filter(Boolean).join(" "),
    forms: [
      form(language, "grammar_pattern", grammar.basePattern, "dictionary", source, confidence),
      form(language, "grammar_pattern", grammar.formAsUsed, "surface", source, confidence),
    ],
    source,
    confidence,
    createdAt,
  });
}

function expressionItems(language: string, line: SongLineAnalysis, source: Provenance, createdAt: string): LearningItem[] {
  const vocabularyForms = new Set(line.vocabulary.flatMap((item) => [item.surfaceForm, item.dictionaryForm]).map((value) => normalizeLearningForm(language, "lemma", value)));
  const confidence = source.origin === "ai" ? 0.67 : 0.86;
  return line.segments.flatMap((segment) => {
    const normalizedAsLemma = normalizeLearningForm(language, "lemma", segment.text);
    if (normalizedAsLemma.length < 2 || vocabularyForms.has(normalizedAsLemma)) return [];
    const type: LearningItemType = /\s/.test(segment.text.trim()) ? "multiword_expression" : "reusable_phrase";
    return [learningItem({
      language,
      type,
      canonicalForm: segment.text,
      gloss: segment.meaning,
      usageNote: segment.role,
      forms: [form(language, type, segment.text, "surface", source, confidence)],
      source,
      confidence,
      createdAt,
    })];
  });
}

export function extractRepeatLearningGraph(input: LearningSourceAnalysisInput): ExtractedRepeatGraph {
  const language = input.language ?? "ko";
  const source = provenance(input);
  const itemMap = new Map<string, LearningItem>();
  const relationshipMap = new Map<string, ItemRelationship>();
  const occurrences: ExtractedOccurrence[] = [];

  function addItem(item: LearningItem, line: SongLineAnalysis, role: ExtractedOccurrence["role"], sourcePhrase = line.originalKorean) {
    const previous = itemMap.get(item.id);
    itemMap.set(item.id, previous ? mergeLearningItem(previous, item) : item);
    for (const sense of item.senses) {
      occurrences.push({ itemId: item.id, senseId: sense.id, lineId: line.lineId, sourceExcerpt: line.originalKorean, sourcePhrase, role });
    }
  }

  function addRelationship(sourceItemId: string, type: ItemRelationship["type"], targetItemId: string, confidence: number) {
    if (sourceItemId === targetItemId) return;
    const id = makeRelationshipId(sourceItemId, type, targetItemId);
    if (relationshipMap.has(id)) return;
    relationshipMap.set(id, {
      id,
      sourceItemId,
      targetItemId,
      type,
      status: "suggested",
      confidence,
      provenance: source,
      createdAt: input.startedAt,
    });
  }

  for (const line of input.analysis.lines) {
    const lineItems: LearningItem[] = [];
    for (const vocabulary of line.vocabulary) {
      const { lemma, surface } = vocabularyItems(language, vocabulary, source, input.startedAt);
      const phrase = line.segments.find((segment) => segment.text.includes(vocabulary.surfaceForm))?.text ?? line.originalKorean;
      addItem(lemma, line, "lemma", phrase);
      lineItems.push(lemma);
      if (surface) {
        addItem(surface, line, "form", phrase);
        lineItems.push(surface);
        addRelationship(surface.id, "inflected_form_of", lemma.id, source.origin === "ai" ? 0.78 : 0.95);
      }
    }
    for (const grammar of line.grammar) {
      const item = grammarItem(language, grammar, source, input.startedAt);
      const phrase = line.segments.find((segment) => segment.text.includes(grammar.formAsUsed))?.text ?? line.originalKorean;
      addItem(item, line, "grammar", phrase);
      lineItems.push(item);
    }
    for (const expression of expressionItems(language, line, source, input.startedAt)) {
      addItem(expression, line, "expression", expression.canonicalForm);
      const normalizedExpression = normalizeLearningForm(language, expression.type, expression.canonicalForm);
      for (const child of lineItems) {
        const comparableForm = child.forms.find((candidate) => normalizedExpression.includes(candidate.normalized))?.normalized ?? child.normalizedForm;
        if (comparableForm.length > 1 && normalizedExpression.includes(comparableForm)) {
          addRelationship(expression.id, "contains", child.id, source.origin === "ai" ? 0.62 : 0.85);
        }
      }
    }
  }

  return { items: [...itemMap.values()], relationships: [...relationshipMap.values()], occurrences };
}

function ingestLearningSourceAnalysis(record: LearnerMemoryRecord, input: LearningSourceAnalysisInput): LearnerMemoryRecord {
  const graph = extractRepeatLearningGraph(input);
  const sourceKind = input.sourceKind ?? "repeat_studio";
  const sourceType = sourceKind === "source_pack" ? "source_pack" as const : input.analysisMeta.demoMode ? "demo" as const : "repeat_studio" as const;
  const events: LearningEvidenceEvent[] = graph.occurrences.map((occurrence) => {
    const dedupeKey = `${sourceKind}-analysis:${input.sessionId}:${occurrence.lineId}:${occurrence.itemId}:${occurrence.senseId ?? "none"}`;
    return {
      id: makeEvidenceId(dedupeKey),
      dedupeKey,
      itemId: occurrence.itemId,
      ...(occurrence.senseId ? { senseId: occurrence.senseId } : {}),
      type: "item_encountered",
      occurredAt: input.startedAt,
      activityType: sourceKind === "source_pack" ? "source_pack_analysis" : "repeat_studio_analysis",
      result: "not_evaluated",
      confidence: input.analysisMeta.provider === "openai" ? 0.78 : 0.92,
      context: {
        sessionId: input.sessionId,
        sourceTitle: input.artist ? `${input.title} — ${input.artist}` : input.title,
        sourceType,
        sourceExcerpt: occurrence.sourceExcerpt,
        sourceReference: input.albumOrSource || undefined,
        lineId: occurrence.lineId,
      },
      aiGenerated: input.analysisMeta.provider === "openai",
      learnerConfirmed: false,
      metadata: { candidateRole: occurrence.role, sourcePhrase: occurrence.sourcePhrase, demoSource: input.analysisMeta.demoMode },
    };
  });
  return upsertLearningGraph(record, { items: graph.items, relationships: graph.relationships, events });
}

export function ingestRepeatAnalysis(record: LearnerMemoryRecord, input: LearningSourceAnalysisInput): LearnerMemoryRecord {
  return ingestLearningSourceAnalysis(record, { ...input, sourceKind: "repeat_studio" });
}

export function ingestSourcePackAnalysis(record: LearnerMemoryRecord, input: LearningSourceAnalysisInput): LearnerMemoryRecord {
  return ingestLearningSourceAnalysis(record, { ...input, sourceKind: "source_pack" });
}

export function ingestRepeatSession(record: LearnerMemoryRecord, session: RepeatSession): LearnerMemoryRecord {
  if (!session.analysis || !session.analysisMeta) return record;
  return ingestRepeatAnalysis(record, {
    sessionId: session.id,
    title: session.title,
    artist: session.artist,
    albumOrSource: session.albumOrSource,
    startedAt: session.startedAt,
    analysis: session.analysis,
    analysisMeta: session.analysisMeta,
  });
}

export function itemIdsForRepeatLine(record: LearnerMemoryRecord, sessionId: string, lineId: string): string[] {
  return [...new Set(record.events
    .filter((event) => event.type === "item_encountered" && event.context.sessionId === sessionId && event.context.lineId === lineId)
    .map((event) => event.itemId))];
}

export function learningItemIdForVocabulary(language: string, vocabulary: SongVocabulary): string {
  return makeLearningItemId(language, "lemma", vocabulary.dictionaryForm);
}

export function learningItemIdForGrammar(language: string, grammar: SongGrammar): string {
  return makeLearningItemId(language, "grammar_pattern", grammar.basePattern);
}

export function recordRepeatLineEvidence(record: LearnerMemoryRecord, input: {
  session: Pick<RepeatSession, "id" | "title" | "artist" | "albumOrSource">;
  lineId: string;
  sourceExcerpt: string;
  actionId: string;
  type: EvidenceEventType;
  activityType: string;
  modality?: LearningModality;
  result?: LearningEvidenceEvent["result"];
  hintLevel?: LearningEvidenceEvent["hintLevel"];
  confidence?: number;
  metadata?: LearningEvidenceEvent["metadata"];
  occurredAt?: string;
}): LearnerMemoryRecord {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const itemIds = itemIdsForRepeatLine(record, input.session.id, input.lineId);
  const events: LearningEvidenceEvent[] = itemIds.map((itemId) => {
    const dedupeKey = `repeat-action:${input.session.id}:${input.lineId}:${input.actionId}:${input.type}:${itemId}`;
    return {
      id: makeEvidenceId(dedupeKey),
      dedupeKey,
      itemId,
      type: input.type,
      occurredAt,
      activityType: input.activityType,
      ...(input.modality ? { modality: input.modality } : {}),
      ...(input.result ? { result: input.result } : {}),
      ...(input.hintLevel ? { hintLevel: input.hintLevel } : {}),
      confidence: input.confidence ?? 0.8,
      context: {
        sessionId: input.session.id,
        sourceTitle: `${input.session.title} — ${input.session.artist}`,
        sourceType: "repeat_studio",
        sourceExcerpt: input.sourceExcerpt,
        sourceReference: input.session.albumOrSource || undefined,
        lineId: input.lineId,
      },
      aiGenerated: false,
      learnerConfirmed: true,
      metadata: input.metadata ?? {},
    };
  });
  return events.length ? upsertLearningGraph(record, { events, updatedAt: occurredAt }) : record;
}
