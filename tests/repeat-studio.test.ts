import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { createSongAnalysisHandler } from "../app/api/song-analysis/route.ts";
import { createRepeatSession, parseStoredSessions, serializeSessions, splitLyrics } from "../app/lib/repeat-studio/session.ts";
import { SongAnalysisSchema, type SongAnalysisService } from "../app/lib/song-analysis/contracts.ts";
import { createDemoSongAnalysis, MockSongAnalysisService, ORIGINAL_DEMO } from "../app/lib/song-analysis/demo.ts";
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
  assert.equal(analysis.partial, true);
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

test("stored repeat sessions round-trip and corrupted storage fails safely", () => {
  const session = createRepeatSession(ORIGINAL_DEMO);
  const loaded = parseStoredSessions(serializeSessions([session]));
  assert.equal(loaded.warning, null);
  assert.equal(loaded.sessions[0].title, ORIGINAL_DEMO.title);
  assert.equal(loaded.sessions[0].schemaVersion, 1);

  const corrupted = parseStoredSessions("{ definitely not json");
  assert.deepEqual(corrupted.sessions, []);
  assert.match(corrupted.warning ?? "", /invalid/i);
});

test("legacy-shaped sessions recover only safe core fields", () => {
  const legacy = JSON.stringify([{ id: "old-1", title: "Old song", artist: "Old artist", lyrics: "첫 줄\n둘째 줄", unsafeExtra: "ignored" }]);
  const result = parseStoredSessions(legacy);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, "old-1");
  assert.equal(Object.keys(result.sessions[0].lineProgress).length, 2);
  assert.match(result.warning ?? "", /upgraded/i);
});

