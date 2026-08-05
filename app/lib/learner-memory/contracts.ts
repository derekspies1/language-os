import { z } from "zod";

export const LEARNER_MEMORY_SCHEMA_VERSION = 2 as const;
export const LEARNER_MEMORY_STORAGE_KEY = "language-os.learner-memory.graph";

export const LearningItemTypeSchema = z.enum([
  "lemma",
  "inflected_form",
  "multiword_expression",
  "collocation",
  "idiom",
  "grammar_pattern",
  "sentence_frame",
  "discourse_marker",
  "named_entity",
  "pronunciation_feature",
  "confusing_pair",
  "cultural_expression",
  "reusable_phrase",
  "other",
]);
export type LearningItemType = z.infer<typeof LearningItemTypeSchema>;

export const LearnerStateSchema = z.enum([
  "new",
  "encountered",
  "familiar",
  "understood_in_context",
  "recognizable",
  "recallable",
  "usable",
  "durable",
]);
export type LearnerState = z.infer<typeof LearnerStateSchema>;

export const LearningModalitySchema = z.enum([
  "listening",
  "reading",
  "comprehension",
  "cued_recall",
  "free_recall",
  "production",
  "appropriate_usage",
  "pronunciation",
]);
export type LearningModality = z.infer<typeof LearningModalitySchema>;

export const EvidenceEventTypeSchema = z.enum([
  "item_encountered",
  "meaning_revealed",
  "meaning_guessed",
  "item_heard",
  "listening_recognized",
  "listening_missed",
  "item_read",
  "reading_recognized",
  "item_reconstructed",
  "recalled_with_hint",
  "recalled_without_hint",
  "learner_created_sentence",
  "usage_evaluated",
  "pronunciation_evaluated",
  "item_marked_confusing",
  "relationship_discovered",
  "review_completed",
  "item_corrected",
  "items_merge_suggested",
  "item_merged",
  "note_updated",
]);
export type EvidenceEventType = z.infer<typeof EvidenceEventTypeSchema>;

export const RelationshipTypeSchema = z.enum([
  "inflected_form_of",
  "derived_from",
  "contains",
  "part_of_expression",
  "synonym",
  "antonym",
  "similar_meaning",
  "commonly_confused_with",
  "commonly_occurs_with",
  "grammar_pattern_used_by",
  "more_formal_than",
  "more_casual_than",
  "stronger_than",
  "weaker_than",
  "topic_association",
  "appeared_in_same_lesson",
  "prerequisite_of",
  "supports",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const KnowledgeClaimStatusSchema = z.enum(["suggested", "learner_confirmed", "system_confirmed", "rejected"]);
export type KnowledgeClaimStatus = z.infer<typeof KnowledgeClaimStatusSchema>;

export const ProvenanceSchema = z.object({
  origin: z.enum(["learner", "system", "ai", "import"]),
  source: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(120).optional(),
  model: z.string().trim().max(160).optional(),
  createdAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ItemFormSchema = z.object({
  text: z.string().trim().min(1).max(600),
  normalized: z.string().trim().min(1).max(600),
  kind: z.enum([
    "dictionary",
    "surface",
    "conjugated",
    "spacing_variant",
    "politeness_variant",
    "contraction",
    "other",
  ]),
  status: KnowledgeClaimStatusSchema,
  confidence: z.number().min(0).max(1),
  provenance: ProvenanceSchema,
});
export type ItemForm = z.infer<typeof ItemFormSchema>;

export const LearningSenseSchema = z.object({
  id: z.string().min(1).max(120),
  gloss: z.string().trim().min(1).max(1_000),
  normalizedGloss: z.string().trim().min(1).max(1_000),
  usageNote: z.string().trim().max(1_000).optional(),
  status: KnowledgeClaimStatusSchema,
  confidence: z.number().min(0).max(1),
  provenance: ProvenanceSchema,
  createdAt: z.string().datetime(),
});
export type LearningSense = z.infer<typeof LearningSenseSchema>;

export const LearningItemSchema = z.object({
  id: z.string().min(1).max(120),
  language: z.string().trim().min(2).max(35),
  type: LearningItemTypeSchema,
  canonicalForm: z.string().trim().min(1).max(600),
  normalizedForm: z.string().trim().min(1).max(600),
  forms: z.array(ItemFormSchema).max(100),
  senses: z.array(LearningSenseSchema).max(100),
  notes: z.string().max(4_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LearningItem = z.infer<typeof LearningItemSchema>;

export const ItemRelationshipSchema = z.object({
  id: z.string().min(1).max(160),
  sourceItemId: z.string().min(1).max(120),
  targetItemId: z.string().min(1).max(120),
  type: RelationshipTypeSchema,
  status: KnowledgeClaimStatusSchema,
  confidence: z.number().min(0).max(1),
  provenance: ProvenanceSchema,
  createdAt: z.string().datetime(),
});
export type ItemRelationship = z.infer<typeof ItemRelationshipSchema>;

export const EvidenceSourceContextSchema = z.object({
  sessionId: z.string().trim().max(120).optional(),
  lessonId: z.string().trim().max(120).optional(),
  sourceTitle: z.string().trim().max(240).optional(),
  sourceType: z.enum(["repeat_studio", "expression_coach", "lesson", "review", "import", "demo", "other"]),
  sourceExcerpt: z.string().trim().max(2_000).optional(),
  sourceReference: z.string().trim().max(500).optional(),
  lineId: z.string().trim().max(120).optional(),
});
export type EvidenceSourceContext = z.infer<typeof EvidenceSourceContextSchema>;

const EvidenceMetadataValueSchema = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

export const LearningEvidenceEventSchema = z.object({
  id: z.string().min(1).max(160),
  dedupeKey: z.string().min(1).max(500),
  itemId: z.string().min(1).max(120),
  senseId: z.string().min(1).max(120).optional(),
  relatedItemId: z.string().min(1).max(120).optional(),
  type: EvidenceEventTypeSchema,
  occurredAt: z.string().datetime(),
  activityType: z.string().trim().min(1).max(120),
  modality: LearningModalitySchema.optional(),
  result: z.enum(["correct", "partial", "incorrect", "completed", "missed", "not_evaluated"]).optional(),
  hintLevel: z.enum(["none", "light", "strong", "answer_shown"]).optional(),
  confidence: z.number().min(0).max(1),
  context: EvidenceSourceContextSchema,
  aiGenerated: z.boolean(),
  learnerConfirmed: z.boolean(),
  metadata: z.record(z.string(), EvidenceMetadataValueSchema).default({}),
});
export type LearningEvidenceEvent = z.infer<typeof LearningEvidenceEventSchema>;

const LearnerMemoryBodySchema = z.object({
  recordId: z.string().min(1).max(120),
  demoData: z.boolean(),
  items: z.array(LearningItemSchema).max(25_000),
  relationships: z.array(ItemRelationshipSchema).max(100_000),
  events: z.array(LearningEvidenceEventSchema).max(150_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const LearnerMemoryRecordSchema = LearnerMemoryBodySchema.extend({
  schemaVersion: z.literal(LEARNER_MEMORY_SCHEMA_VERSION),
}).superRefine((record, context) => {
  const itemIds = new Set<string>();
  const senseIds = new Set<string>();
  record.items.forEach((item, itemIndex) => {
    if (itemIds.has(item.id)) context.addIssue({ code: "custom", path: ["items", itemIndex, "id"], message: "Learning item IDs must be unique." });
    itemIds.add(item.id);
    item.senses.forEach((sense, senseIndex) => {
      if (senseIds.has(sense.id)) context.addIssue({ code: "custom", path: ["items", itemIndex, "senses", senseIndex, "id"], message: "Sense IDs must be unique across the record." });
      senseIds.add(sense.id);
    });
  });

  const relationshipIds = new Set<string>();
  record.relationships.forEach((relationship, index) => {
    if (relationshipIds.has(relationship.id)) context.addIssue({ code: "custom", path: ["relationships", index, "id"], message: "Relationship IDs must be unique." });
    relationshipIds.add(relationship.id);
    if (!itemIds.has(relationship.sourceItemId) || !itemIds.has(relationship.targetItemId)) {
      context.addIssue({ code: "custom", path: ["relationships", index], message: "Relationships must refer to stored learning items." });
    }
    if (relationship.sourceItemId === relationship.targetItemId) {
      context.addIssue({ code: "custom", path: ["relationships", index], message: "Relationships cannot point an item to itself." });
    }
  });

  const eventIds = new Set<string>();
  const dedupeKeys = new Set<string>();
  record.events.forEach((event, index) => {
    if (eventIds.has(event.id)) context.addIssue({ code: "custom", path: ["events", index, "id"], message: "Evidence event IDs must be unique." });
    if (dedupeKeys.has(event.dedupeKey)) context.addIssue({ code: "custom", path: ["events", index, "dedupeKey"], message: "Evidence dedupe keys must be unique." });
    eventIds.add(event.id);
    dedupeKeys.add(event.dedupeKey);
    if (!itemIds.has(event.itemId)) context.addIssue({ code: "custom", path: ["events", index, "itemId"], message: "Evidence must refer to a stored learning item." });
    if (event.senseId && !senseIds.has(event.senseId)) context.addIssue({ code: "custom", path: ["events", index, "senseId"], message: "Evidence sense must be stored on an item." });
    if (event.relatedItemId && !itemIds.has(event.relatedItemId)) context.addIssue({ code: "custom", path: ["events", index, "relatedItemId"], message: "Related evidence items must be stored." });
  });
});
export type LearnerMemoryRecord = z.infer<typeof LearnerMemoryRecordSchema>;

export const ModalityStrengthLevelSchema = z.enum(["none", "emerging", "supported", "reliable", "durable"]);
export type ModalityStrengthLevel = z.infer<typeof ModalityStrengthLevelSchema>;

export const ModalityStrengthSchema = z.object({
  modality: LearningModalitySchema,
  level: ModalityStrengthLevelSchema,
  evidenceCount: z.number().int().nonnegative(),
  successfulAttempts: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  distinctDays: z.number().int().nonnegative(),
  lastEvidenceAt: z.string().datetime().nullable(),
  explanation: z.string().min(1).max(500),
});
export type ModalityStrength = z.infer<typeof ModalityStrengthSchema>;

export const DerivedItemKnowledgeSchema = z.object({
  itemId: z.string().min(1).max(120),
  state: LearnerStateSchema,
  firstEncounterAt: z.string().datetime().nullable(),
  lastEncounterAt: z.string().datetime().nullable(),
  evidenceCount: z.number().int().nonnegative(),
  encounterCount: z.number().int().nonnegative(),
  distinctSessions: z.number().int().nonnegative(),
  modalities: z.record(LearningModalitySchema, ModalityStrengthSchema),
  confusing: z.boolean(),
  dueForReinforcement: z.boolean(),
  weakening: z.boolean(),
  nextReinforcementAt: z.string().datetime().nullable(),
  explanation: z.array(z.string().min(1).max(500)).max(12),
});
export type DerivedItemKnowledge = z.infer<typeof DerivedItemKnowledgeSchema>;

export const LearnerContextItemSchema = z.object({
  itemId: z.string(),
  canonicalForm: z.string(),
  itemType: LearningItemTypeSchema,
  state: LearnerStateSchema,
  meanings: z.array(z.string()).max(3),
  supportedModalities: z.array(LearningModalitySchema).max(8),
  reason: z.string().max(500),
});

export const LearnerContextSummarySchema = z.object({
  schemaVersion: z.literal(1),
  language: z.string().min(2).max(35),
  generatedAt: z.string().datetime(),
  purpose: z.string().min(1).max(200),
  known: z.array(LearnerContextItemSchema).max(20),
  developing: z.array(LearnerContextItemSchema).max(20),
  confusing: z.array(LearnerContextItemSchema).max(12),
  privacy: z.object({
    sourceExcerptsIncluded: z.literal(false),
    eventHistoryIncluded: z.literal(false),
    notesIncluded: z.literal(false),
  }),
});
export type LearnerContextSummary = z.infer<typeof LearnerContextSummarySchema>;

export const ITEM_TYPE_LABELS: Record<LearningItemType, string> = {
  lemma: "Word",
  inflected_form: "Inflected form",
  multiword_expression: "Expression",
  collocation: "Collocation",
  idiom: "Idiom",
  grammar_pattern: "Grammar pattern",
  sentence_frame: "Sentence frame",
  discourse_marker: "Discourse marker",
  named_entity: "Named entity",
  pronunciation_feature: "Pronunciation",
  confusing_pair: "Confusing pair",
  cultural_expression: "Cultural expression",
  reusable_phrase: "Reusable phrase",
  other: "Other",
};

export const LEARNER_STATE_LABELS: Record<LearnerState, string> = {
  new: "New",
  encountered: "Encountered",
  familiar: "Familiar",
  understood_in_context: "Understood in context",
  recognizable: "Recognizable",
  recallable: "Recallable",
  usable: "Usable",
  durable: "Durable",
};

export const MODALITY_LABELS: Record<LearningModality, string> = {
  listening: "Listening recognition",
  reading: "Reading recognition",
  comprehension: "Meaning comprehension",
  cued_recall: "Cued recall",
  free_recall: "Free recall",
  production: "Production",
  appropriate_usage: "Appropriate usage",
  pronunciation: "Pronunciation",
};
