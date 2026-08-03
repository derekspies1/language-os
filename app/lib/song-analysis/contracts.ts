import { z } from "zod";
import type { CoachMeta, ProviderName } from "../coaching/contracts";

const TinyText = z.string().trim().min(1).max(160);
const ShortText = z.string().trim().min(1).max(600);

export const SongLineInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(1_000),
  suppliedTranslation: z.string().trim().max(1_000).optional(),
});

export const SongAnalysisRequestSchema = z.object({
  title: TinyText,
  artist: TinyText,
  albumOrSource: z.string().trim().max(240).optional(),
  personalNotes: z.string().trim().max(2_000).optional(),
  lines: z.array(SongLineInputSchema).min(1).max(80),
});

export const SongSegmentSchema = z.object({
  text: TinyText,
  meaning: ShortText,
  role: z.string().trim().max(240).optional(),
});

export const SongVocabularySchema = z.object({
  id: z.string().trim().min(1).max(100),
  surfaceForm: TinyText,
  dictionaryForm: TinyText,
  meaningInLine: ShortText,
  broaderMeaning: z.string().trim().max(600).optional(),
  partOfSpeech: z.string().trim().max(120).optional(),
  nuance: z.string().trim().max(600).optional(),
  reusability: z.enum(["low", "medium", "high"]),
  relatedForms: z.array(TinyText).max(5).default([]),
});

export const SongGrammarSchema = z.object({
  id: z.string().trim().min(1).max(100),
  formAsUsed: TinyText,
  basePattern: TinyText,
  functionInLine: ShortText,
  explanation: ShortText,
  nearbyAlternative: z.string().trim().max(600).optional(),
  reusableExample: z.string().trim().max(600).optional(),
});

export const SongLineAnalysisSchema = z.object({
  lineId: z.string().trim().min(1).max(80),
  originalKorean: z.string().trim().min(1).max(1_000),
  naturalMeaning: ShortText,
  structuralMeaning: ShortText,
  segments: z.array(SongSegmentSchema).min(1).max(12),
  vocabulary: z.array(SongVocabularySchema).max(12),
  grammar: z.array(SongGrammarSchema).max(8),
  listeningCue: ShortText,
  nuance: ShortText,
  culturalNote: z.string().trim().max(1_000).optional(),
  reviewPriority: z.enum(["low", "medium", "high"]),
});

export const SongAnalysisSchema = z.object({
  overview: ShortText,
  overallTone: ShortText,
  recurringIdeas: z.array(TinyText).max(8),
  repeatedVocabulary: z.array(TinyText).max(10),
  repeatedGrammar: z.array(TinyText).max(8),
  stylisticFeatures: z.array(TinyText).max(8),
  learningPriorities: z.array(TinyText).min(1).max(6),
  lines: z.array(SongLineAnalysisSchema).min(1).max(80),
  partial: z.boolean(),
  omittedLineIds: z.array(z.string().trim().min(1).max(80)).max(80),
});

export type SongLineInput = z.infer<typeof SongLineInputSchema>;
export type SongAnalysisRequest = z.infer<typeof SongAnalysisRequestSchema>;
export type SongSegment = z.infer<typeof SongSegmentSchema>;
export type SongVocabulary = z.infer<typeof SongVocabularySchema>;
export type SongGrammar = z.infer<typeof SongGrammarSchema>;
export type SongLineAnalysis = z.infer<typeof SongLineAnalysisSchema>;
export type SongAnalysis = z.infer<typeof SongAnalysisSchema>;

export interface SongAnalysisService {
  readonly provider: ProviderName;
  readonly model: string;
  analyzeSong(input: SongAnalysisRequest, signal?: AbortSignal): Promise<SongAnalysis>;
}

export type SongAnalysisResponse = { data: SongAnalysis; meta: CoachMeta };
