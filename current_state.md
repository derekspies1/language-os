# Current State

Last updated: 2026-08-08

## Product boundary

Language OS is the learner brain. Learner memory, vocabulary and grammar knowledge, item selection, progress/history, and recommendation logic belong in the core application or future domain packages—not in device clients.

`clients/even-g2` is now the official Even Realities G2 wearable client. It is a thin, independently buildable Even Hub application whose responsibilities are device input, 576×288 rendering, reveal/navigation state, and adapting a Language OS learning feed for the glasses.

## Daily Exposure Loop status

- `/exposure` provides the first central-intelligence loop built directly on the Learner Memory Graph.
- A learner can select a ready Source Pack, provide an optional interest, or choose **Give me Korean**. Source mode selects only graph items derived from that source; generic seeds are not mixed in.
- Recommendation output has a device-neutral, versioned `ExposureFeedSnapshot` contract. Source items add stable source/line context, word/phrase/micro-context audio layers, an initial modality, and transparent source/cross-modal reason codes.
- Reading-first records **Know**, **Familiar**, or **New** against reading. Listening-first hides the Korean and records **Recognized it**, **Familiar sound**, or **Didn’t catch it** against listening. Korean text reveal, meaning reveal, and audio playback are distinct events.
- The set persists locally as an open loop. A later pass records **Got it** as independent retrieval, **Almost** as recognition without retrieval, and **Didn’t stick** as a miss.
- Completion reports actual graph-derived state changes, later recognition, meanings retrieved, familiar items, and weak items. There are no streaks, points, or mastery percentages.
- Daily Exposure and Repeat Studio both write through the same validated graph service. The Learning Universe at `/learn` reads the combined record.
- No API key is required for the loop. Without live source analysis, learner-supplied lines remain safe phrase units without invented translations. Without ElevenLabs, audio reports a non-blocking unavailable state.

## Source Pack status

- `/sources` creates a locally persisted `SourcePack` from learner-supplied title, optional artist/context, and Korean text. Language OS never retrieves or scrapes lyrics.
- Source analysis reuses the existing validated song-analysis provider and line-preservation checks.
- `ingestSourcePackAnalysis` reuses the same normalization, item/sense/form, relationship, merge, and evidence services as Repeat Studio. Stable item identity allows the same Korean to connect across sources.
- Every source occurrence retains source-pack ID, source title, original line ID, exact source excerpt, extracted role, and a compact source phrase.
- The source detail shows counts for mapped items, reading recognition, listening recognition, cross-modal weakness, understandable phrases, and recent strengthening. It intentionally has no mastery percentage.

## Pronunciation status

- `/api/pronunciation` is a validated server-only ElevenLabs Text to Speech boundary. `ELEVENLABS_API_KEY` never enters client code.
- V1 uses `eleven_multilingual_v2`, MP3 output, and an optionally configured `ELEVENLABS_VOICE_ID`; production should choose and physically test a Korean-quality multilingual voice.
- Word, tiny source phrase, and optional source-line layers are supported.
- Identical text is reused through a bounded server memory cache and durable browser Cache API entry.
- Playback contributes `item_heard` listening evidence; playback alone does not imply recognition or meaning retrieval.

## Learner Memory Graph status

- Schema version 2 models items, senses, forms, relationships, evidence, learner state, and strength by modality.
- Persistence is a validated browser-local repository with migration and recovery behavior. This remains intentional until Language OS has a real account/ownership boundary.
- Repeat Studio analysis and activity are integrated idempotently.
- Daily Exposure now contributes source-linked encounter, reveal, recognition, and retrieval evidence.
- Source Packs contribute normalized items and source/line provenance without creating a second vocabulary store.
- `/learn` provides inspection, explanation, search/filtering, notes, JSON backup, and CSV export.

## Even G2 status

- Language Glance V2 was physically validated on Even G2 and is useful enough to be an official client.
- The validated interaction remains Korean → press → natural meaning → press → learner breakdown → press → next.
- A local 20-item Korean deck remains the default offline fixture.
- No Language OS storage, API, learner account, persistence, microphone, or AI provider is connected to the glasses client.
- `LearningFeed` in `clients/even-g2/src/learning-feed.ts` is the only intended future data boundary. A future adapter should consume a public, versioned Language OS endpoint and return a snapshot; it must not import database or server internals.
- Focus and local mock-AI modes remain available from the original Personal HUD experiment but are not part of the learner-domain contract.

## R1 input experiment pending hardware validation

The R1 is now the preferred experimental Language Glance controller. SDK 0.0.12 represents its source as `EventSourceType.TOUCH_EVENT_FROM_RING` (`2`) on `Sys_ItemEvent.eventSource`; right and left glasses are `1` and `3`. Gesture type is reported separately as `eventType`. The input policy combines those current SDK fields and maps hardware-neutral semantic actions before the HUD state machine sees them.

In Language mode, R1 Click reveals/advances, Swipe Up selects the previous item, and Swipe Down selects the next item. Direct item navigation wraps at the first/last item and always resets the destination to Korean-only. R1 Double Click retains system exit. Glasses Click remains a complete reveal/advance fallback, glasses Up/Down retain global HUD mode navigation, and glasses Double Click exits.

The mapping is experimental until a physical pass confirms that the Even Hub host reliably includes the ring source on click and both swipe directions. Development builds log gesture, reported source, and resulting semantic action to the WebView console; diagnostics never appear in the glasses HUD.

## Verification commands

Core:

```bash
npm run lint
npx tsc --noEmit
npm test
```

## Current Git safety note

Central Language OS work and the pre-existing G2 client changes remain uncommitted together on `feature/even-g2-client`. A branch switch would carry the same mixed working tree rather than separate it. Do not reset or destructively split it; review and commit the central and client scopes intentionally before branching further.

G2 client:

```bash
cd clients/even-g2
npm install
npm test
npm run build
npm run pack
```

See `clients/even-g2/README.md` for simulator automation and Prototype Mode sideload instructions.
