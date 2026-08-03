import { z } from "zod";

export const languages = [
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
] as const;

export type LanguageOption = (typeof languages)[number];
export type ProviderName = "openai" | "mock";
export type SessionStage = "attempt" | "rebuild" | "stress" | "complete";

const ShortText = z.string().trim().min(1).max(600);
const LongText = z.string().trim().min(1).max(2_000);

export const CoachingContextSchema = z.object({
  mission: LongText,
  intendedMeaning: LongText,
  targetLanguage: z.object({
    code: z.string().trim().min(2).max(12),
    label: z.string().trim().min(1).max(40),
  }),
  initialAttempt: LongText,
  previousAttempts: z.array(LongText).max(8),
  stage: z.enum(["attempt", "rebuild", "stress", "complete"]),
});

export type CoachingContext = z.infer<typeof CoachingContextSchema>;

export const HintSchema = z.object({
  label: z.string().trim().min(1).max(80),
  content: LongText,
});

export const VocabularyItemSchema = z.object({
  target: ShortText,
  meaning: ShortText,
});

export const PatternItemSchema = z.object({
  pattern: ShortText,
  meaning: ShortText,
});

export const StressQuestionSchema = z.object({
  target: ShortText,
  meaning: ShortText,
  hints: z.array(ShortText).min(1).max(2),
});

export const CoachingAnalysisSchema = z.object({
  understanding: LongText,
  observation: LongText,
  successes: z.array(ShortText).min(1).max(4),
  missingPieces: z.array(ShortText).min(1).max(4),
  hints: z.tuple([HintSchema, HintSchema, HintSchema]),
  vocabulary: z.array(VocabularyItemSchema).min(1).max(6),
  patterns: z.array(PatternItemSchema).min(1).max(5),
  naturalVersion: LongText,
  breakdown: z.array(ShortText).min(1).max(6),
});

export const RebuildEvaluationSchema = z.object({
  progress: LongText,
  communicatedMeaning: z.boolean(),
  nextStep: ShortText,
  naturalVersion: LongText,
});

export const StressQuestionsSchema = z.object({
  questions: z.array(StressQuestionSchema).min(2).max(3),
});

export const StressAnswerEvaluationSchema = z.object({
  understood: z.boolean(),
  feedback: LongText,
  nextStep: ShortText,
  naturalVersion: LongText,
});

export const SessionSummarySchema = z.object({
  capability: ShortText,
  improvedFinalVersion: LongText,
  words: z.array(VocabularyItemSchema).min(1).max(8),
  patterns: z.array(PatternItemSchema).min(1).max(6),
  reviewChallenge: LongText,
});

export type Hint = z.infer<typeof HintSchema>;
export type VocabularyItem = z.infer<typeof VocabularyItemSchema>;
export type PatternItem = z.infer<typeof PatternItemSchema>;
export type StressQuestion = z.infer<typeof StressQuestionSchema>;
export type CoachingAnalysis = z.infer<typeof CoachingAnalysisSchema>;
export type RebuildEvaluation = z.infer<typeof RebuildEvaluationSchema>;
export type StressQuestions = z.infer<typeof StressQuestionsSchema>;
export type StressAnswerEvaluation = z.infer<typeof StressAnswerEvaluationSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export interface CoachingService {
  readonly provider: ProviderName;
  readonly model: string;
  analyzeAttempt(context: CoachingContext, signal?: AbortSignal): Promise<CoachingAnalysis>;
  evaluateRebuiltAttempt(context: CoachingContext, rebuiltAttempt: string, signal?: AbortSignal): Promise<RebuildEvaluation>;
  generateStressTestQuestions(context: CoachingContext, rebuiltAttempt: string, signal?: AbortSignal): Promise<StressQuestions>;
  evaluateStressTestAnswer(
    context: CoachingContext,
    question: StressQuestion,
    answer: string,
    signal?: AbortSignal,
  ): Promise<StressAnswerEvaluation>;
  createSessionSummary(
    context: CoachingContext,
    rebuiltAttempt: string,
    stressAnswers: string[],
    signal?: AbortSignal,
  ): Promise<SessionSummary>;
}

const AnalyzeRequestSchema = z.object({
  action: z.literal("analyze_attempt"),
  context: CoachingContextSchema,
});

const RebuildRequestSchema = z.object({
  action: z.literal("evaluate_rebuild"),
  context: CoachingContextSchema,
  rebuiltAttempt: LongText,
});

const StressRequestSchema = z.object({
  action: z.literal("evaluate_stress"),
  context: CoachingContextSchema,
  question: StressQuestionSchema,
  answer: LongText,
});

const CompleteRequestSchema = z.object({
  action: z.literal("complete_session"),
  context: CoachingContextSchema,
  rebuiltAttempt: LongText,
  stressAnswers: z.array(LongText).min(2).max(3),
});

export const CoachRequestSchema = z.discriminatedUnion("action", [
  AnalyzeRequestSchema,
  RebuildRequestSchema,
  StressRequestSchema,
  CompleteRequestSchema,
]);

export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export const CoachMetaSchema = z.object({
  provider: z.enum(["openai", "mock"]),
  model: z.string().trim().min(1).max(160),
  demoMode: z.boolean(),
  responseTimeMs: z.number().nonnegative(),
  validationFailures: z.array(z.string().max(200)).max(10),
  error: z.string().max(1_000).nullable(),
  liveProviderConfigured: z.boolean(),
});

export const ProviderStatusSchema = z.object({
  provider: z.enum(["openai", "mock"]),
  model: z.string().trim().min(1).max(160),
  demoMode: z.boolean(),
});

export type CoachMeta = z.infer<typeof CoachMetaSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export type CoachResponse<T> = { data: T; meta: CoachMeta };
