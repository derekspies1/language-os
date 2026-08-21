import { z } from "zod";
import { LearnerStateSchema } from "../learner-memory/contracts";

export const EXPOSURE_SCHEMA_VERSION = 1 as const;
export const EXPOSURE_STORAGE_KEY = "language-os.daily-exposure.sessions";

export const InterestDomainSchema = z.enum(["kpop", "music", "reactions", "gaming", "lck", "everyday", "general"]);
export type InterestDomain = z.infer<typeof InterestDomainSchema>;

export const LearningIntentSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().trim().min(1).max(300),
  domains: z.array(InterestDomainSchema).min(1).max(5),
  createdAt: z.string().datetime(),
  sourcePackId: z.string().min(1).max(120).optional(),
});
export type LearningIntent = z.infer<typeof LearningIntentSchema>;

export const SelectionReasonSchema = z.enum([
  "related_to_current_interest",
  "previous_weak_encounter",
  "reinforce_familiar_item",
  "related_to_known_word",
  "new_exploration",
  "from_active_source",
  "listening_gap",
  "reading_gap",
  "cross_modal_pair",
  "source_line_return",
]);
export type SelectionReason = z.infer<typeof SelectionReasonSchema>;

export const ExposureFeedItemSchema = z.object({
  id: z.string().min(1).max(120),
  targetLanguage: z.literal("ko"),
  targetText: z.string().trim().min(1).max(120),
  naturalMeaning: z.string().trim().min(1).max(300),
  usageClue: z.string().trim().min(1).max(300),
  reason: SelectionReasonSchema,
  reasonText: z.string().trim().min(1).max(300),
  learnerState: LearnerStateSchema,
  interestDomains: z.array(InterestDomainSchema).min(1).max(5),
  initialModality: z.enum(["reading", "listening"]).default("reading"),
  source: z.object({
    sourcePackId: z.string().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    context: z.string().trim().max(240),
    lineId: z.string().min(1).max(80),
    sourceExcerpt: z.string().trim().min(1).max(1_000),
  }).optional(),
  audio: z.object({
    word: z.string().trim().min(1).max(160),
    phrase: z.string().trim().min(1).max(160),
    microContext: z.string().trim().min(1).max(160).optional(),
  }).optional(),
});
export type ExposureFeedItem = z.infer<typeof ExposureFeedItemSchema>;

export const ExposureFeedSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  intent: LearningIntentSchema,
  items: z.array(ExposureFeedItemSchema).min(1).max(30),
});
export type ExposureFeedSnapshot = z.infer<typeof ExposureFeedSnapshotSchema>;

export const InitialExposureResponseSchema = z.enum(["know", "familiar", "new"]);
export type InitialExposureResponse = z.infer<typeof InitialExposureResponseSchema>;

export const CloseLoopOutcomeSchema = z.enum(["got_it", "almost", "didnt_stick"]);
export type CloseLoopOutcome = z.infer<typeof CloseLoopOutcomeSchema>;

const ExposureEvidenceBaseSchema = z.object({
  schemaVersion: z.literal(EXPOSURE_SCHEMA_VERSION),
  sessionId: z.string().min(1).max(120),
  itemId: z.string().min(1).max(120),
  occurredAt: z.string().datetime(),
});

export const ExposureEvidenceInputSchema = z.discriminatedUnion("action", [
  ExposureEvidenceBaseSchema.extend({ action: z.literal("meaning_revealed") }),
  ExposureEvidenceBaseSchema.extend({ action: z.literal("korean_revealed") }),
  ExposureEvidenceBaseSchema.extend({
    action: z.literal("audio_played"),
    layer: z.enum(["word", "phrase", "micro_context"]),
  }),
  ExposureEvidenceBaseSchema.extend({
    action: z.literal("initial_response"),
    response: InitialExposureResponseSchema,
  }),
  ExposureEvidenceBaseSchema.extend({
    action: z.literal("close_outcome"),
    outcome: CloseLoopOutcomeSchema,
  }),
]);
export type ExposureEvidenceInput = z.infer<typeof ExposureEvidenceInputSchema>;

export const ExposureSessionItemSchema = ExposureFeedItemSchema.extend({
  meaningRevealed: z.boolean(),
  initialResponse: InitialExposureResponseSchema.nullable(),
  initialRespondedAt: z.string().datetime().nullable(),
  closeOutcome: CloseLoopOutcomeSchema.nullable(),
  closedAt: z.string().datetime().nullable(),
  stateAfter: LearnerStateSchema.nullable(),
  koreanRevealed: z.boolean().optional(),
  initialComplete: z.boolean().optional(),
  audioPlayed: z.boolean().optional(),
});
export type ExposureSessionItem = z.infer<typeof ExposureSessionItemSchema>;

export const ExposureSessionSchema = z.object({
  schemaVersion: z.literal(EXPOSURE_SCHEMA_VERSION),
  id: z.string().min(1).max(120),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intent: LearningIntentSchema,
  status: z.enum(["exposing", "awaiting_close", "closing", "complete"]),
  items: z.array(ExposureSessionItemSchema).min(1).max(30),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ExposureSession = z.infer<typeof ExposureSessionSchema>;

export const ExposureSessionEnvelopeSchema = z.object({
  schemaVersion: z.literal(EXPOSURE_SCHEMA_VERSION),
  sessions: z.array(ExposureSessionSchema).max(180),
});
export type ExposureSessionEnvelope = z.infer<typeof ExposureSessionEnvelopeSchema>;

export type ExposureSummary = {
  exposed: number;
  laterRecognized: number;
  meaningsRetrieved: number;
  remainFamiliar: number;
  stillWeak: number;
};
