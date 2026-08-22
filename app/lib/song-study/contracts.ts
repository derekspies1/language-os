import { z } from "zod";

export const SONG_STUDY_SCHEMA_VERSION = 1 as const;
export const SONG_STUDY_STORAGE_KEY = "language-os.song-study.projects";

export const MediaReferenceSchema = z.object({
  kind: z.enum(["audio", "video"]),
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.string().max(200),
  size: z.number().int().nonnegative(),
  lastModified: z.number().int().nonnegative(),
  duration: z.number().nonnegative().max(86_400).nullable(),
});
export type MediaReference = z.infer<typeof MediaReferenceSchema>;

export const CueTimingSchema = z.object({
  start: z.number().nonnegative().max(86_400),
  end: z.number().nonnegative().max(86_400).nullable(),
}).superRefine((timing, context) => {
  if (timing.end !== null && timing.end <= timing.start) {
    context.addIssue({ code: "custom", path: ["end"], message: "A cue range must end after it starts." });
  }
});
export type CueTiming = z.infer<typeof CueTimingSchema>;

export const CueLayerKindSchema = z.enum([
  "target_text",
  "natural_meaning",
  "literal_meaning",
  "breakdown",
  "vocabulary",
  "grammar",
  "pronunciation",
  "mnemonic",
  "question",
  "note",
]);
export type CueLayerKind = z.infer<typeof CueLayerKindSchema>;

export const CueLayerSchema = z.object({
  id: z.string().min(1).max(120),
  kind: CueLayerKindSchema,
  value: z.string().trim().min(1).max(8_000),
  provenance: z.enum(["learner", "ai", "corrected"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CueLayer = z.infer<typeof CueLayerSchema>;

export const LearnerAttemptSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["listening_transcription", "meaning_interpretation", "challenge_response"]),
  response: z.string().trim().min(1).max(8_000),
  createdAt: z.string().datetime(),
  beforeAssistance: z.boolean(),
});
export type LearnerAttempt = z.infer<typeof LearnerAttemptSchema>;

export const SongCueSchema = z.object({
  id: z.string().min(1).max(120),
  timing: CueTimingSchema,
  status: z.enum(["investigated", "uncertain", "understood", "difficult"]),
  confidence: z.enum(["uncertain", "developing", "confident"]),
  difficulty: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(60)).max(30),
  attempts: z.array(LearnerAttemptSchema).max(500),
  layers: z.array(CueLayerSchema).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SongCue = z.infer<typeof SongCueSchema>;

export const ChallengeModeSchema = z.enum(["audio_to_target", "target_to_meaning", "meaning_to_target"]);
export type ChallengeMode = z.infer<typeof ChallengeModeSchema>;

export const ChallengeEventSchema = z.object({
  id: z.string().min(1).max(120),
  cueId: z.string().min(1).max(120),
  mode: ChallengeModeSchema,
  response: z.string().trim().max(8_000),
  outcome: z.enum(["got_it", "almost", "missed"]),
  occurredAt: z.string().datetime(),
});
export type ChallengeEvent = z.infer<typeof ChallengeEventSchema>;

export const PlaybackStateSchema = z.object({
  position: z.number().nonnegative().max(86_400),
  volume: z.number().min(0).max(1),
  rate: z.number().min(0.5).max(2),
  loopEnabled: z.boolean(),
  loopStart: z.number().nonnegative().max(86_400).nullable(),
  loopEnd: z.number().nonnegative().max(86_400).nullable(),
}).superRefine((state, context) => {
  if (state.loopStart !== null && state.loopEnd !== null && state.loopEnd <= state.loopStart) {
    context.addIssue({ code: "custom", path: ["loopEnd"], message: "Loop end must be after loop start." });
  }
});

export const SongProjectSchema = z.object({
  schemaVersion: z.literal(SONG_STUDY_SCHEMA_VERSION),
  id: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().max(160),
  media: MediaReferenceSchema,
  cues: z.array(SongCueSchema).max(2_000),
  challengeHistory: z.array(ChallengeEventSchema).max(10_000),
  playback: PlaybackStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastStudiedAt: z.string().datetime(),
}).superRefine((project, context) => {
  const cueIds = new Set(project.cues.map((cue) => cue.id));
  if (cueIds.size !== project.cues.length) {
    context.addIssue({ code: "custom", path: ["cues"], message: "Cue IDs must be unique." });
  }
  project.challengeHistory.forEach((event, index) => {
    if (!cueIds.has(event.cueId)) {
      context.addIssue({ code: "custom", path: ["challengeHistory", index, "cueId"], message: "Challenges must refer to a current cue." });
    }
  });
});
export type SongProject = z.infer<typeof SongProjectSchema>;

export const SongStudyEnvelopeSchema = z.object({
  schemaVersion: z.literal(SONG_STUDY_SCHEMA_VERSION),
  projects: z.array(SongProjectSchema).max(100),
});

function newId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
export function createSongProject(input: { title: string; artist?: string; media: MediaReference }, now = new Date().toISOString()): SongProject {
  return SongProjectSchema.parse({
    schemaVersion: SONG_STUDY_SCHEMA_VERSION,
    id: newId("song"),
    title: input.title,
    artist: input.artist ?? "",
    media: input.media,
    cues: [],
    challengeHistory: [],
    playback: { position: 0, volume: 0.85, rate: 1, loopEnabled: false, loopStart: null, loopEnd: null },
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: now,
  });
}

export function createSongCue(input: { timing: CueTiming; attempt: string }, now = new Date().toISOString()): SongCue {
  const attempt = LearnerAttemptSchema.parse({
    id: newId("attempt"),
    kind: "listening_transcription",
    response: input.attempt,
    createdAt: now,
    beforeAssistance: true,
  });
  return SongCueSchema.parse({
    id: newId("cue"),
    timing: input.timing,
    status: input.attempt.includes("?") ? "uncertain" : "investigated",
    confidence: "uncertain",
    difficulty: 3,
    tags: [],
    attempts: [attempt],
    layers: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function upsertCueLayer(cue: SongCue, input: { kind: CueLayerKind; value: string; provenance?: CueLayer["provenance"] }, now = new Date().toISOString()): SongCue {
  const value = input.value.trim();
  const current = cue.layers.find((layer) => layer.kind === input.kind && layer.provenance === (input.provenance ?? "learner"));
  const layers = value
    ? current
      ? cue.layers.map((layer) => layer.id === current.id ? { ...layer, value, updatedAt: now } : layer)
      : [...cue.layers, CueLayerSchema.parse({ id: newId("layer"), kind: input.kind, value, provenance: input.provenance ?? "learner", createdAt: now, updatedAt: now })]
    : current ? cue.layers.filter((layer) => layer.id !== current.id) : cue.layers;
  return SongCueSchema.parse({ ...cue, layers, updatedAt: now });
}

export function cueLayerValue(cue: SongCue, kind: CueLayerKind): string {
  return [...cue.layers].reverse().find((layer) => layer.kind === kind)?.value ?? "";
}

export function cueDisplayText(cue: SongCue): string {
  return cueLayerValue(cue, "target_text") || cue.attempts[0]?.response || "Untitled fragment";
}

export function cueAtTime(cues: SongCue[], time: number): SongCue | null {
  const candidates = cues.filter((cue) => cue.timing.end === null
    ? Math.abs(time - cue.timing.start) <= 2.25
    : time >= cue.timing.start && time <= cue.timing.end);
  return candidates.sort((a, b) => Math.abs(time - a.timing.start) - Math.abs(time - b.timing.start))[0] ?? null;
}

export function addChallengeEvent(project: SongProject, input: Omit<ChallengeEvent, "id" | "occurredAt">, now = new Date().toISOString()): SongProject {
  const event = ChallengeEventSchema.parse({ ...input, id: newId("challenge"), occurredAt: now });
  const cue = project.cues.find((item) => item.id === event.cueId);
  if (!cue) throw new Error("Challenge cue does not exist.");
  const attempt = event.response ? LearnerAttemptSchema.parse({ id: newId("attempt"), kind: "challenge_response", response: event.response, createdAt: now, beforeAssistance: true }) : null;
  return SongProjectSchema.parse({
    ...project,
    cues: project.cues.map((item) => item.id === event.cueId && attempt ? { ...item, attempts: [...item.attempts, attempt], updatedAt: now } : item),
    challengeHistory: [...project.challengeHistory, event],
    updatedAt: now,
    lastStudiedAt: now,
  });
}
