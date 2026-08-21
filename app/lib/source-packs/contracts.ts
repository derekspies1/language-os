import { z } from "zod";
import { CoachMetaSchema } from "../coaching/contracts";
import {
  SongAnalysisRequestSchema,
  SongAnalysisSchema,
  type SongAnalysisRequest,
} from "../song-analysis/contracts";
import { stableHash } from "../learner-memory/normalization";

export const SOURCE_PACK_SCHEMA_VERSION = 1 as const;
export const SOURCE_PACK_STORAGE_KEY = "language-os.source-packs";
export const PENDING_SOURCE_PACK_KEY = "language-os.daily-exposure.pending-source";

export const SourcePackSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACK_SCHEMA_VERSION),
  id: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  context: z.string().trim().max(240),
  koreanText: z.string().trim().min(1).max(80_000),
  lines: SongAnalysisRequestSchema.shape.lines,
  analysis: SongAnalysisSchema.nullable(),
  analysisMeta: CoachMetaSchema.nullable(),
  analysisStatus: z.enum(["idle", "loading", "ready", "error"]),
  analysisError: z.string().max(1_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((pack, context) => {
  if (Boolean(pack.analysis) !== Boolean(pack.analysisMeta)) {
    context.addIssue({ code: "custom", path: ["analysisMeta"], message: "Analysis and provider metadata must be stored together." });
  }
  if (pack.analysisStatus === "ready" && (!pack.analysis || !pack.analysisMeta)) {
    context.addIssue({ code: "custom", path: ["analysisStatus"], message: "Ready source packs require validated analysis." });
  }
});
export type SourcePack = z.infer<typeof SourcePackSchema>;

export const SourcePackEnvelopeSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACK_SCHEMA_VERSION),
  packs: z.array(SourcePackSchema).max(100),
});

export function splitSourceText(koreanText: string): SongAnalysisRequest["lines"] {
  return koreanText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `line-${String(index + 1).padStart(3, "0")}`, text }));
}

export function getSourcePackDraftError(input: { title: string; context?: string; koreanText: string }): string | null {
  if (!input.title.trim()) return "Add a title for this source.";
  const lines = splitSourceText(input.koreanText);
  if (!lines.length) return "Paste at least one line of Korean text.";
  if (lines.length > 80) return `Keep this source to 80 non-empty lines (currently ${lines.length}).`;
  if (lines.some((line) => line.text.length > 1_000)) return "Keep each source line to 1,000 characters.";
  const parsed = SongAnalysisRequestSchema.safeParse({
    title: input.title,
    artist: input.context?.trim() || "Personal source",
    albumOrSource: "Learner-pasted Source Pack",
    lines,
  });
  return parsed.success ? null : parsed.error.issues[0]?.message ?? "This source could not be validated.";
}

export function createSourcePack(
  input: { title: string; context?: string; koreanText: string },
  now = new Date().toISOString(),
): SourcePack {
  const error = getSourcePackDraftError(input);
  if (error) throw new Error(error);
  const title = input.title.trim();
  const context = input.context?.trim() ?? "";
  const koreanText = splitSourceText(input.koreanText).map((line) => line.text).join("\n");
  return SourcePackSchema.parse({
    schemaVersion: SOURCE_PACK_SCHEMA_VERSION,
    id: `source_${stableHash(`${now}\u0000${title}\u0000${koreanText}`)}`,
    title,
    context,
    koreanText,
    lines: splitSourceText(koreanText),
    analysis: null,
    analysisMeta: null,
    analysisStatus: "idle",
    analysisError: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function sourcePackAnalysisRequest(pack: SourcePack): SongAnalysisRequest {
  return SongAnalysisRequestSchema.parse({
    title: pack.title,
    artist: pack.context || "Personal source",
    albumOrSource: "Learner-pasted Source Pack",
    personalNotes: "Analyze only the supplied Korean. Select reusable vocabulary, expressions, and phrase boundaries for source-driven exposure.",
    lines: pack.lines,
  });
}
