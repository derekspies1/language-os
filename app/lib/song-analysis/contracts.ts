import { z } from "zod";
import { CoachMetaSchema, type CoachMeta, type ProviderName } from "../coaching/contracts";

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
  personalNotes: z.string().trim().max(4_000).optional(),
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

export const SongAnalysisShapeSchema = z.object({
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

export const SongAnalysisSchema = SongAnalysisShapeSchema.superRefine((analysis, context) => {
  const lineIds = new Set<string>();
  const vocabularyIds = new Set<string>();
  const grammarIds = new Set<string>();
  for (const [lineIndex, line] of analysis.lines.entries()) {
    if (lineIds.has(line.lineId)) {
      context.addIssue({ code: "custom", path: ["lines", lineIndex, "lineId"], message: "Line IDs must be unique." });
    }
    lineIds.add(line.lineId);
    for (const [itemIndex, item] of line.vocabulary.entries()) {
      if (vocabularyIds.has(item.id)) context.addIssue({ code: "custom", path: ["lines", lineIndex, "vocabulary", itemIndex, "id"], message: "Vocabulary IDs must be unique." });
      vocabularyIds.add(item.id);
    }
    for (const [itemIndex, item] of line.grammar.entries()) {
      if (grammarIds.has(item.id)) context.addIssue({ code: "custom", path: ["lines", lineIndex, "grammar", itemIndex, "id"], message: "Grammar IDs must be unique." });
      grammarIds.add(item.id);
    }
  }
  const omitted = new Set<string>();
  for (const [index, lineId] of analysis.omittedLineIds.entries()) {
    if (omitted.has(lineId) || lineIds.has(lineId)) context.addIssue({ code: "custom", path: ["omittedLineIds", index], message: "Omitted line IDs must be unique and cannot also be analyzed." });
    omitted.add(lineId);
  }
  if (analysis.partial !== (analysis.omittedLineIds.length > 0)) {
    context.addIssue({ code: "custom", path: ["partial"], message: "Partial must reflect whether line IDs were omitted." });
  }
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
export const SongAnalysisResponseSchema = z.object({ data: SongAnalysisSchema, meta: CoachMetaSchema });

export function validateSongAnalysisForRequest(input: SongAnalysisRequest, candidate: unknown): SongAnalysis {
  return SongAnalysisSchema.superRefine((analysis, context) => {
    const inputs = new Map(input.lines.map((line) => [line.id, line.text]));
    const analyzedIds = new Set<string>();
    analysis.lines.forEach((line, lineIndex) => {
      const original = inputs.get(line.lineId);
      if (!original) {
        context.addIssue({ code: "custom", path: ["lines", lineIndex, "lineId"], message: "Analysis cannot refer to an unknown input line." });
        return;
      }
      if (original !== line.originalKorean) {
        context.addIssue({ code: "custom", path: ["lines", lineIndex, "originalKorean"], message: "Analysis cannot change learner-supplied Korean." });
      }
      const normalizedOriginal = original.replace(/\s+/g, "");
      line.segments.forEach((segment, segmentIndex) => {
        if (!normalizedOriginal.includes(segment.text.replace(/\s+/g, ""))) {
          context.addIssue({ code: "custom", path: ["lines", lineIndex, "segments", segmentIndex, "text"], message: "Analyzed segments must come from the supplied Korean line." });
        }
      });
      analyzedIds.add(line.lineId);
    });
    const expectedOmissions = input.lines.map((line) => line.id).filter((lineId) => !analyzedIds.has(lineId)).sort();
    const actualOmissions = [...analysis.omittedLineIds].sort();
    if (expectedOmissions.join("\u0000") !== actualOmissions.join("\u0000")) {
      context.addIssue({ code: "custom", path: ["omittedLineIds"], message: "Omitted line IDs must exactly account for supplied lines without analysis." });
    }
  }).parse(candidate);
}
