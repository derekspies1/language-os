import assert from "node:assert/strict";
import test from "node:test";
import {
  addChallengeEvent,
  createSongCue,
  createSongProject,
  cueAtTime,
  cueLayerValue,
  SONG_STUDY_SCHEMA_VERSION,
  upsertCueLayer,
  type MediaReference,
} from "../app/lib/song-study/contracts.ts";
import { InMemorySongStudyRepository, parseSongProjects } from "../app/lib/song-study/repository.ts";

const media: MediaReference = {
  kind: "audio",
  fileName: "favorite-song.mp3",
  mimeType: "audio/mpeg",
  size: 4_200_000,
  lastModified: 1_786_310_400_000,
  duration: 203.4,
};

test("song projects persist metadata and learning state without media bytes", async () => {
  const repository = new InMemorySongStudyRepository();
  const project = createSongProject({ title: "Favorite song", artist: "Favorite artist", media }, "2026-08-10T12:00:00.000Z");
  await repository.save(project);
  const loaded = await repository.load();

  assert.equal(loaded.warning, null);
  assert.equal(loaded.projects[0].schemaVersion, SONG_STUDY_SCHEMA_VERSION);
  assert.equal(loaded.projects[0].media.fileName, media.fileName);
  assert.equal("bytes" in loaded.projects[0].media, false);
  assert.deepEqual(loaded.projects[0].cues, []);
});

test("quick capture preserves the first listening attempt while later layers evolve", () => {
  const cue = createSongCue({ timing: { start: 42.1, end: 45.8 }, attempt: "보고 싶... ?" }, "2026-08-10T12:00:00.000Z");
  const enriched = upsertCueLayer(upsertCueLayer(cue, {
    kind: "target_text",
    value: "보고 싶다고 말할까",
  }, "2026-08-10T12:05:00.000Z"), {
    kind: "grammar",
    value: "-다고 = quoted statement",
  }, "2026-08-10T12:06:00.000Z");
  const corrected = upsertCueLayer(enriched, {
    kind: "target_text",
    value: "보고 싶다고 말할까?",
  }, "2026-08-10T12:08:00.000Z");

  assert.equal(corrected.attempts[0].response, "보고 싶... ?");
  assert.equal(corrected.attempts[0].beforeAssistance, true);
  assert.equal(corrected.attempts.length, 1);
  assert.equal(cueLayerValue(corrected, "target_text"), "보고 싶다고 말할까?");
  assert.equal(cueLayerValue(corrected, "grammar"), "-다고 = quoted statement");
});

test("timed cues activate for ranges and briefly around point markers", () => {
  const range = createSongCue({ timing: { start: 10, end: 12 }, attempt: "range" });
  const point = createSongCue({ timing: { start: 20, end: null }, attempt: "point" });
  assert.equal(cueAtTime([range, point], 11)?.id, range.id);
  assert.equal(cueAtTime([range, point], 21.9)?.id, point.id);
  assert.equal(cueAtTime([range, point], 23), null);
});

test("challenge events preserve modality-specific mode, outcome, and learner response", () => {
  const cue = upsertCueLayer(createSongCue({ timing: { start: 7, end: 9 }, attempt: "처음 들은 말" }), { kind: "target_text", value: "정확한 한국어" });
  const project = { ...createSongProject({ title: "Challenge song", media }), cues: [cue] };
  const next = addChallengeEvent(project, {
    cueId: cue.id,
    mode: "audio_to_target",
    response: "정확한 한구거",
    outcome: "almost",
  }, "2026-08-10T13:00:00.000Z");

  assert.equal(next.challengeHistory[0].mode, "audio_to_target");
  assert.equal(next.challengeHistory[0].outcome, "almost");
  assert.equal(next.cues[0].attempts.at(-1)?.kind, "challenge_response");
  assert.equal(next.cues[0].attempts.at(-1)?.response, "정확한 한구거");
});

test("invalid ranges and orphaned challenge events are rejected", () => {
  assert.throws(() => createSongCue({ timing: { start: 4, end: 3 }, attempt: "bad timing" }), /end after it starts/i);
  const project = createSongProject({ title: "No cues", media });
  assert.throws(() => addChallengeEvent(project, { cueId: "missing", mode: "audio_to_target", response: "attempt", outcome: "missed" }), /does not exist/i);
});

test("malformed local storage fails closed without partially trusting projects", () => {
  assert.deepEqual(parseSongProjects(null), { projects: [], warning: null });
  const malformed = parseSongProjects('{"schemaVersion":1,"projects":[{"title":"partial"}]}');
  assert.deepEqual(malformed.projects, []);
  assert.match(malformed.warning ?? "", /could not be validated/i);
});
