import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { createSongAnalysisHandler } from "../app/api/song-analysis/route.ts";
import { createRepeatSession, parseStoredSessions, RepeatSessionSchema, serializeSessions, SESSION_SCHEMA_VERSION, splitLyrics } from "../app/lib/repeat-studio/session.ts";
import { SongAnalysisResponseSchema, SongAnalysisSchema, validateSongAnalysisForRequest, type SongAnalysisService } from "../app/lib/song-analysis/contracts.ts";
import { createDemoSongAnalysis, MockSongAnalysisService, ORIGINAL_DEMO } from "../app/lib/song-analysis/demo.ts";
import { OpenAISongAnalysisService } from "../app/lib/song-analysis/server/openai-song-analyzer.ts";
import { resolveSongAnalysisService } from "../app/lib/song-analysis/server/provider.ts";

function originalDemoRequest() {
  return {
    title: ORIGINAL_DEMO.title,
    artist: ORIGINAL_DEMO.artist,
    albumOrSource: ORIGINAL_DEMO.albumOrSource,
    personalNotes: ORIGINAL_DEMO.personalNotes,
    lines: splitLyrics(ORIGINAL_DEMO.lyrics),
  };
}

test("original demo analysis is complete, validated, and preserves every Korean line", () => {
  const request = originalDemoRequest();
  const analysis = SongAnalysisSchema.parse(createDemoSongAnalysis(request));
  assert.equal(analysis.partial, false);
  assert.equal(analysis.lines.length, request.lines.length);
  assert.deepEqual(analysis.lines.map((line) => line.originalKorean), request.lines.map((line) => line.text));
  assert.ok(analysis.lines.every((line) => line.listeningCue.length > 0));
});

test("demo mode does not invent detailed meanings for learner-supplied text", async () => {
  const analysis = await new MockSongAnalysisService().analyzeSong({
    title: "Learner excerpt",
    artist: "Learner source",
    lines: [{ id: "line-001", text: "처음 보는 문장" }],
  });
  assert.equal(analysis.partial, false);
  assert.match(analysis.lines[0].naturalMeaning, /demo mode/i);
  assert.equal(analysis.lines[0].vocabulary.length, 0);
  assert.equal(analysis.lines[0].grammar.length, 0);
});

test("selects the song demo analyzer when live configuration is absent", () => {
  const resolved = resolveSongAnalysisService({} as NodeJS.ProcessEnv);
  assert.equal(resolved.configuredLiveProvider, false);
  assert.equal(resolved.service.provider, "mock");
});

test("song route validates requests and falls back after malformed live analysis", async () => {
  const malformed: SongAnalysisService = {
    provider: "openai",
    model: "malformed-live",
    async analyzeSong() {
      throw new ZodError([{ code: "custom", path: ["lines"], message: "bad line shape", input: null }]);
    },
  };
  const handler = createSongAnalysisHandler({ resolveService: () => ({ service: malformed, configuredLiveProvider: true }) });
  const response = await handler(new Request("http://localhost/api/song-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(originalDemoRequest()),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.meta.provider, "mock");
  assert.equal(body.meta.demoMode, true);
  assert.ok(body.meta.validationFailures.includes("lines"));
  assert.equal(body.data.lines.length, originalDemoRequest().lines.length);
});

test("song route rejects shape-valid analysis that changes learner-supplied Korean", async () => {
  const request = originalDemoRequest();
  const changed = createDemoSongAnalysis(request);
  changed.lines[0] = { ...changed.lines[0], originalKorean: "바뀐 문장", segments: [{ text: "바뀐 문장", meaning: "changed" }] };
  const misleading: SongAnalysisService = {
    provider: "openai",
    model: "shape-valid-but-wrong",
    async analyzeSong() { return changed; },
  };
  const response = await createSongAnalysisHandler({ resolveService: () => ({ service: misleading, configuredLiveProvider: true }) })(new Request("http://localhost/api/song-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.meta.provider, "mock");
  assert.ok(body.meta.validationFailures.some((path: string) => path.includes("originalKorean")));
});

test("analysis contracts reject duplicate IDs, invented segments, and malformed response metadata", () => {
  const request = originalDemoRequest();
  const duplicate = createDemoSongAnalysis(request);
  duplicate.lines[1].vocabulary[0] = { ...duplicate.lines[1].vocabulary[0], id: duplicate.lines[0].vocabulary[0].id };
  assert.equal(SongAnalysisSchema.safeParse(duplicate).success, false);

  const invented = createDemoSongAnalysis(request);
  invented.lines[0].segments[0] = { ...invented.lines[0].segments[0], text: "원문에 없는 말" };
  assert.throws(() => validateSongAnalysisForRequest(request, invented), ZodError);

  const valid = createDemoSongAnalysis(request);
  assert.equal(SongAnalysisResponseSchema.safeParse({ data: valid, meta: { provider: "mock" } }).success, false);
});

test("live song adapter normalizes a safe partial response instead of trusting stale omission flags", async () => {
  const request = originalDemoRequest();
  const partial = createDemoSongAnalysis(request);
  const omitted = partial.lines.pop();
  partial.partial = false;
  partial.omittedLineIds = [];
  const service = new OpenAISongAnalysisService("test-model", { async generate() { return partial; } } as never);
  const result = await service.analyzeSong(request);
  assert.equal(result.partial, true);
  assert.deepEqual(result.omittedLineIds, [omitted?.lineId]);
});

test("splitLyrics never truncates silently and pairs non-empty translations in order", () => {
  const lines = splitLyrics("첫 줄\n\n둘째 줄", "First\n\nSecond");
  assert.deepEqual(lines.map((line) => line.suppliedTranslation), ["First", "Second"]);
  assert.equal(splitLyrics(Array.from({ length: 81 }, (_, index) => `줄 ${index + 1}`).join("\n")).length, 81);
  assert.throws(() => createRepeatSession({ title: "Too long", artist: "Tester", lyrics: Array.from({ length: 81 }, (_, index) => `줄 ${index + 1}`).join("\n") }), /80 non-empty lines/i);
});

test("stored repeat sessions round-trip and corrupted storage fails safely", () => {
  const session = createRepeatSession(ORIGINAL_DEMO);
  const loaded = parseStoredSessions(serializeSessions([session]));
  assert.equal(loaded.warning, null);
  assert.equal(loaded.sessions[0].title, ORIGINAL_DEMO.title);
  assert.equal(loaded.sessions[0].schemaVersion, SESSION_SCHEMA_VERSION);

  const corrupted = parseStoredSessions("{ definitely not json");
  assert.deepEqual(corrupted.sessions, []);
  assert.match(corrupted.warning ?? "", /invalid/i);
});

test("version 1 sessions preserve validated learning data while migrating dishonest pass counts", () => {
  const base = createRepeatSession(ORIGINAL_DEMO);
  const analysis = createDemoSongAnalysis(originalDemoRequest());
  const firstId = splitLyrics(base.lyrics)[0].id;
  const previous = {
    ...base,
    schemaVersion: 1,
    passCount: 9,
    analysis,
    analysisMeta: {
      provider: "mock",
      model: "language-os-song-demo-v1",
      demoMode: true,
      responseTimeMs: 3,
      validationFailures: [],
      error: null,
      liveProviderConfigured: false,
    },
    analysisStatus: "ready",
    lineProgress: {
      ...base.lineProgress,
      [firstId]: { ...base.lineProgress[firstId], initialState: "sounds", currentState: "understood", interpretation: "Dawn reaches the window." },
    },
  };
  const loaded = parseStoredSessions(JSON.stringify({ schemaVersion: 1, sessions: [previous] }));
  assert.equal(loaded.sessions[0].schemaVersion, 2);
  assert.equal(loaded.sessions[0].passCount, 0);
  assert.equal(loaded.sessions[0].analysis?.lines.length, analysis.lines.length);
  assert.equal(loaded.sessions[0].lineProgress[firstId].interpretation, "Dawn reaches the window.");
  assert.match(loaded.warning ?? "", /upgraded/i);
});

test("version 1 migration repairs the old generic-demo partial flag without dropping progress", () => {
  const draft = { title: "Learner excerpt", artist: "Learner source", lyrics: "처음 보는 문장" };
  const base = createRepeatSession(draft);
  const oldAnalysis = { ...createDemoSongAnalysis({ title: draft.title, artist: draft.artist, lines: splitLyrics(draft.lyrics) }), partial: true };
  const previous = {
    ...base,
    schemaVersion: 1,
    analysis: oldAnalysis,
    analysisMeta: { provider: "mock", model: "language-os-song-demo-v1", demoMode: true, responseTimeMs: 1, validationFailures: [], error: null, liveProviderConfigured: false },
    analysisStatus: "ready",
    lineProgress: { ...base.lineProgress, "line-001": { ...base.lineProgress["line-001"], interpretation: "My preserved guess" } },
  };
  const loaded = parseStoredSessions(JSON.stringify({ schemaVersion: 1, sessions: [previous] }));
  assert.equal(loaded.sessions[0].analysis?.partial, false);
  assert.equal(loaded.sessions[0].lineProgress["line-001"].interpretation, "My preserved guess");
});

test("persisted loading sessions recover as retryable cancellation instead of staying stuck", () => {
  const base = createRepeatSession(ORIGINAL_DEMO);
  const loading = { ...base, analysisStatus: "loading" as const };
  const loaded = parseStoredSessions(JSON.stringify({ schemaVersion: 2, sessions: [loading] }));
  assert.equal(loaded.sessions[0].analysisStatus, "cancelled");
  assert.match(loaded.sessions[0].analysisError ?? "", /page closed/i);
  assert.match(loaded.warning ?? "", /interrupted/i);
});

test("session validation rejects stale cross-field references that could corrupt the UI", () => {
  const base = createRepeatSession(ORIGINAL_DEMO);
  const firstId = splitLyrics(base.lyrics)[0].id;
  const staleProgress = {
    ...base,
    lineProgress: {
      ...base.lineProgress,
      [firstId]: { ...base.lineProgress[firstId], markedVocabularyIds: ["removed-word"] },
    },
  };
  assert.equal(RepeatSessionSchema.safeParse(staleProgress).success, false);

  const invalidSelectedLine = { ...base, selectedLineId: "line-999" };
  assert.equal(RepeatSessionSchema.safeParse(invalidSelectedLine).success, false);
});

test("legacy-shaped sessions recover only safe core fields", () => {
  const legacy = JSON.stringify([{ id: "old-1", title: "Old song", artist: "Old artist", lyrics: "첫 줄\n둘째 줄", unsafeExtra: "ignored" }]);
  const result = parseStoredSessions(legacy);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, "old-1");
  assert.equal(Object.keys(result.sessions[0].lineProgress).length, 2);
  assert.match(result.warning ?? "", /upgraded/i);
});
