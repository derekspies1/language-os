import { z } from "zod";
import { SongAnalysisSchema, type SongAnalysisRequest } from "../song-analysis/contracts";

export const SESSION_STORAGE_KEY = "language-os.repeat-studio.sessions";
export const SESSION_SCHEMA_VERSION = 1 as const;

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

const AnalysisMetaSchema = z.object({
  provider: z.enum(["openai", "mock"]),
  model: z.string().max(160),
  demoMode: z.boolean(),
  responseTimeMs: z.number().nonnegative(),
  validationFailures: z.array(z.string().max(200)).max(10),
  error: z.string().max(1_000).nullable(),
  liveProviderConfigured: z.boolean(),
});

export const RepeatSessionSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().min(1).max(160),
  albumOrSource: z.string().max(240),
  lyrics: z.string().trim().min(1).max(80_000),
  existingTranslation: z.string().max(80_000),
  personalNotes: z.string().max(4_000),
  analysis: SongAnalysisSchema.nullable(),
  analysisMeta: AnalysisMetaSchema.nullable(),
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
  const translations = translation.split(/\r?\n/);
  return lyrics
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((text, index) => ({
      id: `line-${String(index + 1).padStart(3, "0")}`,
      text,
      ...(translations[index]?.trim() ? { suppliedTranslation: translations[index].trim() } : {}),
    }));
}

export function createRepeatSession(input: {
  title: string;
  artist: string;
  albumOrSource?: string;
  lyrics: string;
  existingTranslation?: string;
  personalNotes?: string;
}): RepeatSession {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
  const lines = splitLyrics(input.lyrics, input.existingTranslation);
  const lineProgress = Object.fromEntries(lines.map((line) => [line.id, {
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
    title: input.title,
    artist: input.artist,
    albumOrSource: input.albumOrSource ?? "",
    lyrics: input.lyrics,
    existingTranslation: input.existingTranslation ?? "",
    personalNotes: input.personalNotes ?? "",
    analysis: null,
    analysisMeta: null,
    analysisStatus: "idle",
    analysisError: null,
    mode: "guess",
    passCount: 1,
    selectedLineId: lines[0]?.id,
    lineProgress,
    rebuildAttempts: [],
    reuseSentences: {},
    startedAt: now,
    lastStudiedAt: now,
  });
}

function recoverSession(candidate: unknown): RepeatSession | null {
  const current = RepeatSessionSchema.safeParse(candidate);
  if (current.success) return current.data;
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
    return RepeatSessionSchema.parse({
      ...base,
      id: typeof value.id === "string" ? value.id : base.id,
      startedAt: typeof value.startedAt === "string" ? value.startedAt : base.startedAt,
      lastStudiedAt: typeof value.lastStudiedAt === "string" ? value.lastStudiedAt : base.lastStudiedAt,
    });
  } catch {
    return null;
  }
}

export function parseStoredSessions(raw: string | null): LoadSessionsResult {
  if (!raw) return { sessions: [], warning: null };
  try {
    const decoded: unknown = JSON.parse(raw);
    const exact = SessionEnvelopeSchema.safeParse(decoded);
    if (exact.success) return { sessions: exact.data.sessions, warning: null };

    const candidates = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === "object" && Array.isArray((decoded as { sessions?: unknown }).sessions)
        ? (decoded as { sessions: unknown[] }).sessions
        : [];
    const recovered = candidates.map(recoverSession).filter((session): session is RepeatSession => session !== null);
    return {
      sessions: recovered,
      warning: recovered.length > 0
        ? "Saved sessions were safely upgraded. Unsupported fields were left behind."
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

