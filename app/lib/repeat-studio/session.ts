import { z } from "zod";
import { CoachMetaSchema } from "../coaching/contracts";
import {
  SongAnalysisRequestSchema,
  SongAnalysisShapeSchema,
  SongAnalysisSchema,
  type SongAnalysisRequest,
} from "../song-analysis/contracts";

export const SESSION_STORAGE_KEY = "language-os.repeat-studio.sessions";
export const SESSION_SCHEMA_VERSION = 2 as const;

export const UnderstandingStateSchema = z.enum(["unknown", "sounds", "partial", "understood", "reusable"]);
export type UnderstandingState = z.infer<typeof UnderstandingStateSchema>;

export const RepeatModeSchema = z.enum(["guess", "unpack", "hear", "rebuild", "return"]);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

const RevealStateSchema = z.object({
  meaning: z.boolean(),
  structure: z.boolean(),
  depth: z.boolean(),
});

export const LineProgressSchema = z.object({
  lineId: z.string().min(1).max(80),
  initialState: UnderstandingStateSchema.nullable(),
  currentState: UnderstandingStateSchema,
  interpretation: z.string().max(2_000),
  reveals: RevealStateSchema,
  marked: z.boolean(),
  markedVocabularyIds: z.array(z.string().max(100)).max(30),
  markedGrammarIds: z.array(z.string().max(100)).max(20),
  notes: z.string().max(2_000),
});

export const RebuildAttemptSchema = z.object({
  id: z.string().min(1).max(100),
  lineId: z.string().min(1).max(80),
  kind: z.enum(["restore", "meaning", "reuse"]),
  prompt: z.string().max(2_000),
  response: z.string().max(2_000),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
});

const SessionBodySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().min(1).max(160),
  albumOrSource: z.string().max(240),
  lyrics: z.string().trim().min(1).max(80_000),
  existingTranslation: z.string().max(80_000),
  personalNotes: z.string().max(4_000),
  analysis: SongAnalysisSchema.nullable(),
  analysisMeta: CoachMetaSchema.nullable(),
  analysisStatus: z.enum(["idle", "loading", "ready", "error", "cancelled"]),
  analysisError: z.string().max(1_000).nullable(),
  mode: RepeatModeSchema,
  passCount: z.number().int().nonnegative().max(10_000),
  selectedLineId: z.string().min(1).max(80),
  lineProgress: z.record(z.string(), LineProgressSchema),
  rebuildAttempts: z.array(RebuildAttemptSchema).max(500),
  reuseSentences: z.record(z.string(), z.string().max(2_000)),
  startedAt: z.string().datetime(),
  lastStudiedAt: z.string().datetime(),
});

type SessionIntegrityInput = z.infer<typeof SessionBodySchema> & { schemaVersion: number };

function validateSessionIntegrity(session: SessionIntegrityInput, context: z.RefinementCtx) {
  const lines = splitLyrics(session.lyrics, session.existingTranslation);
  const lineIds = new Set(lines.map((line) => line.id));
  if (lines.length < 1 || lines.length > 80) {
    context.addIssue({ code: "custom", path: ["lyrics"], message: "Sessions must contain between 1 and 80 non-empty lyric lines." });
  }
  lines.forEach((line, index) => {
    if (line.text.length > 1_000) {
      context.addIssue({ code: "custom", path: ["lyrics"], message: `Lyric line ${index + 1} exceeds 1,000 characters.` });
    }
    if (line.suppliedTranslation && line.suppliedTranslation.length > 1_000) {
      context.addIssue({ code: "custom", path: ["existingTranslation"], message: `Translation line ${index + 1} exceeds 1,000 characters.` });
    }
  });

  if (!lineIds.has(session.selectedLineId)) {
    context.addIssue({ code: "custom", path: ["selectedLineId"], message: "The selected line must exist in the session lyrics." });
  }
  for (const lineId of lineIds) {
    const progress = session.lineProgress[lineId];
    if (!progress || progress.lineId !== lineId) {
      context.addIssue({ code: "custom", path: ["lineProgress", lineId], message: "Every lyric line must have matching progress." });
    }
  }
  for (const lineId of Object.keys(session.lineProgress)) {
    if (!lineIds.has(lineId)) {
      context.addIssue({ code: "custom", path: ["lineProgress", lineId], message: "Progress cannot refer to a missing lyric line." });
    }
  }

  if (session.analysis) {
    const analyzedIds = new Set<string>();
    session.analysis.lines.forEach((line, index) => {
      const source = lines.find((item) => item.id === line.lineId);
      if (!source) {
        context.addIssue({ code: "custom", path: ["analysis", "lines", index, "lineId"], message: "Analysis cannot refer to a missing lyric line." });
      } else if (source.text !== line.originalKorean) {
        context.addIssue({ code: "custom", path: ["analysis", "lines", index, "originalKorean"], message: "Analyzed Korean must match the learner-supplied line." });
      }
      analyzedIds.add(line.lineId);
    });
    const expectedOmissions = lines.map((line) => line.id).filter((lineId) => !analyzedIds.has(lineId));
    const actualOmissions = [...session.analysis.omittedLineIds].sort();
    if (expectedOmissions.sort().join("\u0000") !== actualOmissions.sort().join("\u0000")) {
      context.addIssue({ code: "custom", path: ["analysis", "omittedLineIds"], message: "Omitted lines must match the supplied lyrics that lack analysis." });
    }
    for (const [lineId, progress] of Object.entries(session.lineProgress)) {
      const line = session.analysis.lines.find((item) => item.lineId === lineId);
      const vocabularyIds = new Set(line?.vocabulary.map((item) => item.id) ?? []);
      const grammarIds = new Set(line?.grammar.map((item) => item.id) ?? []);
      if (progress.markedVocabularyIds.some((id) => !vocabularyIds.has(id))) {
        context.addIssue({ code: "custom", path: ["lineProgress", lineId, "markedVocabularyIds"], message: "Marked vocabulary must exist in this line's current analysis." });
      }
      if (progress.markedGrammarIds.some((id) => !grammarIds.has(id))) {
        context.addIssue({ code: "custom", path: ["lineProgress", lineId, "markedGrammarIds"], message: "Marked grammar must exist in this line's current analysis." });
      }
    }
  } else if (Object.values(session.lineProgress).some((progress) => progress.markedVocabularyIds.length || progress.markedGrammarIds.length)) {
    context.addIssue({ code: "custom", path: ["lineProgress"], message: "Analysis-backed marks cannot exist without analysis." });
  }

  if (Boolean(session.analysis) !== Boolean(session.analysisMeta)) {
    context.addIssue({ code: "custom", path: ["analysisMeta"], message: "Analysis and provider metadata must be stored together." });
  }
  if (session.analysisStatus === "ready" && (!session.analysis || !session.analysisMeta)) {
    context.addIssue({ code: "custom", path: ["analysisStatus"], message: "Ready sessions require validated analysis and provider metadata." });
  }
  session.rebuildAttempts.forEach((attempt, index) => {
    if (!lineIds.has(attempt.lineId)) {
      context.addIssue({ code: "custom", path: ["rebuildAttempts", index, "lineId"], message: "Rebuild attempts must refer to a current lyric line." });
    }
  });
  for (const key of Object.keys(session.reuseSentences)) {
    if (lineIds.has(key)) continue;
    const match = /^treasure:(line-\d{3}):(\d+)$/.exec(key);
    const line = match ? session.analysis?.lines.find((item) => item.lineId === match[1]) : null;
    if (!match || !line || Number(match[2]) >= line.segments.length) {
      context.addIssue({ code: "custom", path: ["reuseSentences", key], message: "Reuse sentences must belong to a current line or phrase treasure." });
    }
  }
}

const RepeatSessionV1Schema = SessionBodySchema.extend({
  schemaVersion: z.literal(1),
  analysis: SongAnalysisShapeSchema.nullable(),
}).superRefine(validateSessionIntegrity);
export const RepeatSessionSchema = SessionBodySchema.extend({ schemaVersion: z.literal(SESSION_SCHEMA_VERSION) }).superRefine(validateSessionIntegrity);

export type RepeatSession = z.infer<typeof RepeatSessionSchema>;
export type LineProgress = z.infer<typeof LineProgressSchema>;
export type RebuildAttempt = z.infer<typeof RebuildAttemptSchema>;

const SessionEnvelopeSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  sessions: z.array(RepeatSessionSchema).max(100),
});

export type LoadSessionsResult = {
  sessions: RepeatSession[];
  warning: string | null;
};

export function splitLyrics(lyrics: string, translation = ""): SongAnalysisRequest["lines"] {
  const translations = translation.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
  return lyrics
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `line-${String(index + 1).padStart(3, "0")}`,
      text,
      ...(translations[index] ? { suppliedTranslation: translations[index] } : {}),
    }));
}

type RepeatSessionDraft = {
  title: string;
  artist: string;
  albumOrSource?: string;
  lyrics: string;
  existingTranslation?: string;
  personalNotes?: string;
};

export function getSessionDraftError(input: RepeatSessionDraft): string | null {
  const lines = splitLyrics(input.lyrics, input.existingTranslation);
  if (!input.title.trim()) return "Add a song title.";
  if (!input.artist.trim()) return "Add an artist.";
  if (lines.length === 0) return "Paste at least one Korean lyric line.";
  if (lines.length > 80) return `Keep this study excerpt to 80 non-empty lines (currently ${lines.length}).`;
  const longLyric = lines.findIndex((line) => line.text.length > 1_000);
  if (longLyric >= 0) return `Lyric line ${longLyric + 1} is longer than 1,000 characters.`;
  const longTranslation = lines.findIndex((line) => (line.suppliedTranslation?.length ?? 0) > 1_000);
  if (longTranslation >= 0) return `Translation line ${longTranslation + 1} is longer than 1,000 characters.`;
  const parsed = SongAnalysisRequestSchema.safeParse({
    title: input.title,
    artist: input.artist,
    albumOrSource: input.albumOrSource || undefined,
    personalNotes: input.personalNotes || undefined,
    lines,
  });
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue.path[0] === "personalNotes") return "Keep personal notes to 4,000 characters.";
  if (issue.path[0] === "albumOrSource") return "Keep the album or source note to 240 characters.";
  return issue.message;
}

export function createRepeatSession(input: RepeatSessionDraft): RepeatSession {
  const draftError = getSessionDraftError(input);
  if (draftError) throw new Error(draftError);
  const request = SongAnalysisRequestSchema.parse({
    title: input.title,
    artist: input.artist,
    albumOrSource: input.albumOrSource || undefined,
    personalNotes: input.personalNotes || undefined,
    lines: splitLyrics(input.lyrics, input.existingTranslation),
  });
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
  const lineProgress = Object.fromEntries(request.lines.map((line) => [line.id, {
    lineId: line.id,
    initialState: null,
    currentState: "unknown" as const,
    interpretation: "",
    reveals: { meaning: false, structure: false, depth: false },
    marked: false,
    markedVocabularyIds: [],
    markedGrammarIds: [],
    notes: "",
  }]));

  return RepeatSessionSchema.parse({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    title: request.title,
    artist: request.artist,
    albumOrSource: request.albumOrSource ?? "",
    lyrics: request.lines.map((line) => line.text).join("\n"),
    existingTranslation: request.lines.map((line) => line.suppliedTranslation ?? "").join("\n"),
    personalNotes: request.personalNotes ?? "",
    analysis: null,
    analysisMeta: null,
    analysisStatus: "idle",
    analysisError: null,
    mode: "guess",
    passCount: 0,
    selectedLineId: request.lines[0].id,
    lineProgress,
    rebuildAttempts: [],
    reuseSentences: {},
    startedAt: now,
    lastStudiedAt: now,
  });
}

function normalizeInterruptedSession(session: RepeatSession): { session: RepeatSession; interrupted: boolean } {
  if (session.analysisStatus !== "loading") return { session, interrupted: false };
  return {
    session: RepeatSessionSchema.parse({
      ...session,
      analysisStatus: "cancelled",
      analysisError: "Analysis stopped when the page closed. Retry when you are ready.",
    }),
    interrupted: true,
  };
}

function recoverSession(candidate: unknown): { session: RepeatSession; migrated: boolean; interrupted: boolean } | null {
  const current = RepeatSessionSchema.safeParse(candidate);
  if (current.success) {
    const normalized = normalizeInterruptedSession(current.data);
    return { ...normalized, migrated: false };
  }
  const previous = RepeatSessionV1Schema.safeParse(candidate);
  if (previous.success) {
    const lines = splitLyrics(previous.data.lyrics, previous.data.existingTranslation);
    const analyzedIds = new Set(previous.data.analysis?.lines.map((line) => line.lineId) ?? []);
    const omittedLineIds = lines.map((line) => line.id).filter((lineId) => !analyzedIds.has(lineId));
    const analysis = previous.data.analysis ? SongAnalysisSchema.parse({
      ...previous.data.analysis,
      partial: omittedLineIds.length > 0,
      omittedLineIds,
    }) : null;
    const migrated = RepeatSessionSchema.parse({ ...previous.data, schemaVersion: SESSION_SCHEMA_VERSION, passCount: 0, analysis });
    const normalized = normalizeInterruptedSession(migrated);
    return { ...normalized, migrated: true };
  }
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Record<string, unknown>;
  if (typeof value.title !== "string" || typeof value.artist !== "string" || typeof value.lyrics !== "string") return null;

  try {
    const base = createRepeatSession({
      title: value.title,
      artist: value.artist,
      lyrics: value.lyrics,
      albumOrSource: typeof value.albumOrSource === "string" ? value.albumOrSource : "",
      existingTranslation: typeof value.existingTranslation === "string" ? value.existingTranslation : "",
      personalNotes: typeof value.personalNotes === "string" ? value.personalNotes : "",
    });
    return {
      session: RepeatSessionSchema.parse({
        ...base,
        id: typeof value.id === "string" ? value.id : base.id,
        startedAt: typeof value.startedAt === "string" ? value.startedAt : base.startedAt,
        lastStudiedAt: typeof value.lastStudiedAt === "string" ? value.lastStudiedAt : base.lastStudiedAt,
      }),
      migrated: true,
      interrupted: false,
    };
  } catch {
    return null;
  }
}

export function parseStoredSessions(raw: string | null): LoadSessionsResult {
  if (!raw) return { sessions: [], warning: null };
  try {
    const decoded: unknown = JSON.parse(raw);
    const candidates = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === "object" && Array.isArray((decoded as { sessions?: unknown }).sessions)
        ? (decoded as { sessions: unknown[] }).sessions
        : [];
    const recovered = candidates.map(recoverSession).filter((result): result is NonNullable<typeof result> => result !== null);
    if (recovered.length === candidates.length && recovered.length > 0) {
      const migrated = recovered.some((result) => result.migrated);
      const interrupted = recovered.some((result) => result.interrupted);
      return {
        sessions: recovered.map((result) => result.session),
        warning: interrupted
          ? "An interrupted analysis was recovered safely. Retry it when you are ready."
          : migrated ? "Saved sessions were safely upgraded to the current format." : null,
      };
    }
    return {
      sessions: recovered.map((result) => result.session),
      warning: recovered.length > 0
        ? "Some saved sessions could not be validated and were ignored. Readable sessions were kept."
        : "Saved Repeat Studio data could not be read and was ignored.",
    };
  } catch {
    return { sessions: [], warning: "Saved Repeat Studio data was invalid and was ignored." };
  }
}

export function serializeSessions(sessions: RepeatSession[]): string {
  return JSON.stringify(SessionEnvelopeSchema.parse({ schemaVersion: SESSION_SCHEMA_VERSION, sessions }));
}

export const UNDERSTANDING_LABELS: Record<UnderstandingState, string> = {
  unknown: "Unknown",
  sounds: "Sounds only",
  partial: "Partial",
  understood: "Understood",
  reusable: "Reusable",
};
