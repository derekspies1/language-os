# Song Study Studio

Song Study Studio is a first-class active listening experience at `/song-study`. It implements the Language OS principle that the system should sometimes give the learner a project rather than an answer.

## Architectural fit

The experience owns a separate `SongProject` aggregate rather than stretching Repeat Studio's line-oriented analysis session into a media editor. It reuses the repository's existing decisions: versioned Zod contracts, validated browser-local persistence, explicit recovery warnings, Korean-first presentation, and append-oriented learner evidence.

The vertical slice is intentionally centered on:

**listen → isolate → attempt → capture → replay → enrich → test → hear again**

The browser handles file playback, timestamps, A/B looping, synchronization, and durable notes. It does not retrieve lyrics or automatically solve the song.

## Domain model and provenance

`SongProject` stores identifying media metadata, playback state, timed cues, and challenge history. `SongCue` supports a point or start/end range and contains:

- immutable `LearnerAttempt` records for first-hearing transcription and later challenge responses;
- provenance-tagged `CueLayer` records for target text, meanings, breakdown, vocabulary, grammar, pronunciation, mnemonics, questions, and notes;
- learner-controlled confidence, difficulty, status, and tags; and
- creation and update timestamps.

Layers distinguish `learner`, `ai`, and `corrected` provenance even though V1 only authors learner layers. Updating a current layer never replaces the first listening attempt. Challenge events distinguish hear-to-Korean, Korean-to-meaning, and meaning-to-Korean instead of emitting a universal mastery value.

## Persistence and local media

Projects are validated under schema version 1 and stored at `language-os.song-study.projects` through `BrowserSongStudyRepository`. Media bytes are deliberately not copied into `localStorage`, IndexedDB, or application data. Only file name, MIME type, byte size, last-modified timestamp, media kind, and learned duration are retained.

Browsers cannot safely reopen an arbitrary local file path after a later visit. Returning projects therefore show a clear reconnect state and preserve the last playback position, cues, loops, and challenge history while asking the learner to select the local file again. Renamed or moved files can be reattached. Audio and video share the same `HTMLMediaElement` transport, with audio as the primary experience.

## Learner Memory Graph boundary

V1 does not create graph items from arbitrary, possibly incomplete learner transcription and does not pretend that a cue maps cleanly to a normalized vocabulary item or sense. Song Study preserves the evidence needed for a later adapter: cue and attempt IDs, source project, exact response, timing, provenance, challenge modality, outcome, and timestamps.

A later integration should explicitly promote learner-confirmed target phrases, vocabulary, or grammar layers into graph items, then append source-linked evidence with a `song_study` source type. It should treat media playback as contact only, first transcription as an attempt, reveal as answer shown, and rated challenges as modality-specific evidence. This boundary avoids duplicating the Learner Memory Graph or flattening song work into correct/incorrect cards.

## Intentionally deferred

- AI help buttons and server-side correction/translation (the model already preserves pre-assistance attempts and future AI provenance)
- automatic lyric retrieval or whole-song generation
- normalized Learner Memory Graph promotion UI
- cue split/merge and multi-track DAW editing
- cloud sync, account ownership, and cross-device media references
- waveform extraction, export/rendering, and generated pronunciation
- automatic challenge scheduling or a universal mastery percentage
