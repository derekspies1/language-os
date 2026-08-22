# Language OS

Language OS is a focused language-learning prototype built around one idea: real desire should drive contact with language, and contact should become evidence rather than a score. Its connected surfaces are the expression coach, learner-supplied Source Packs, Daily Exposure, K-pop Repeat Studio, and the shared Learning Universe.

The repository also contains official thin clients. The Even Realities G2 client lives in [`clients/even-g2`](clients/even-g2) and consumes a typed learning-feed boundary; it does not import learner storage or domain internals.

## Learning flow

1. Choose a real mission and target language.
2. Make an unassisted first attempt.
3. Reveal coaching in three increasingly explicit levels.
4. Rebuild the thought while preserving the original attempt.
5. Answer 2–3 follow-up questions using the new language.
6. Leave with acquired words, reusable patterns, and a retrieval challenge.

The UI never receives all hints at once. The server can prepare a complete analysis, but the learner explicitly reveals each level before rebuilding.

## Daily Exposure Loop

Open `/exposure` to learn from one ready Source Pack or turn a lightweight intention into a Korean-first set of 12 useful words. Source mode deliberately stays inside the selected source; it does not mix generic K-pop, LCK, or exploratory vocabulary into a song the learner explicitly wants to whittle down.

The selector transparently mixes:

- words related to the current interest;
- previous weak encounters;
- familiar items worth reinforcing;
- useful neighbors of known language; and
- a small amount of new exploration.

The first pass may be reading-first or listening-first. Reading-first shows Korean and can immediately play the word, a tiny phrase, or its short source line. Listening-first hides the Korean until the learner records **Recognized it**, **Familiar sound**, or **Didn’t catch it**. Meaning and source context remain optional reveals. The set then stays open until the learner chooses **Close today’s loop** and reports what survived as **Got it**, **Almost**, or **Didn’t stick**.

Audio playback, Korean text reveal, meaning reveal, reading recognition, listening recognition, and free recall append distinct evidence. They never create a mastery percentage, streak, or permanent grade.

## Source Packs

Open `/sources` and paste Korean lyrics or text you already have. A Source Pack stores the title, optional artist/context, exact learner-supplied lines, validated structured analysis, and provider metadata locally.

The existing song-analysis infrastructure identifies line units, useful vocabulary, surface forms, grammar patterns, and expressions. Those units enter the same Learner Memory Graph as Repeat Studio using stable IDs. Source and line provenance remain attached to every occurrence, so the same Korean item can accumulate evidence across multiple sources without becoming duplicate vocabulary.

Without `OPENAI_API_KEY`, Source Packs preserve each supplied line as a safe phrase unit and do not invent meanings. With the existing live analyzer configured, they produce detailed validated items and meanings.

The source detail view reports grounded counts—items mapped, recognizable while reading, recognizable by sound, weak across a modality, phrases becoming understandable, and recently strengthened—without collapsing them into a percentage.

## Learner Memory Graph

Open `/learn` to inspect the shared evidence record. It stores typed items, forms, senses, relationships, source-linked events, modality-specific strength, and explainable derived states. The graph is documented in [`docs/learner-memory-graph.md`](docs/learner-memory-graph.md), and the product rules behind it are in [`docs/learning-principles.md`](docs/learning-principles.md).

The current repository is versioned browser `localStorage`. This is deliberate while Language OS has no learner identity: it provides durable local sessions without inventing an unsafe shared server identity. It does not sync between browsers. JSON export from the Learning Universe is the current backup format.

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal.

Useful routes:

- `/exposure` — Daily Exposure Loop
- `/sources` — learner-supplied Source Packs
- `/learn` — Learning Universe
- `/repeat` — K-pop Repeat Studio
- `/` — expression coach

## Configure live coaching

Copy the example environment file and add a server-side API key:

```bash
cp .env.example .env.local
```

Then set:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5-mini
```

Restart `npm run dev` after changing environment variables. The key is read only inside the server route and must never use a `NEXT_PUBLIC_` prefix.

## Configure Korean pronunciation

ElevenLabs pronunciation is optional and server-side:

```bash
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_VOICE_ID=your_korean_tested_voice_id
ELEVENLABS_MODEL=eleven_multilingual_v2
```

`ELEVENLABS_VOICE_ID` defaults to the voice used in ElevenLabs’ official API example, but production should select and physically test a multilingual voice for Korean. Audio uses the official Text to Speech endpoint, returns MP3, and is reused through a bounded server cache plus the browser Cache API. When the key is absent or the provider fails, the exposure loop continues and the audio control explains that pronunciation is unavailable.

To verify the live coach:

1. Confirm the top-right badge says **LIVE COACH**.
2. Submit a mission and first attempt that differ from the README example.
3. Confirm the scaffolding refers specifically to that mission and attempt.
4. In development, expand **Development diagnostics** to see the provider, model, request state, response time, validation fields, and sanitized error state.

## Demo mode and fallback

When `OPENAI_API_KEY` is absent, Language OS automatically uses the deterministic mock coach and labels the interface **DEMO COACH**. If a configured live request fails or returns malformed structured output, that individual request falls back to the same mock coach. Attempts remain in browser state, and diagnostics show only sanitized failure information—never the key, raw model response, or hidden system prompt.

The Korean demo path is complete. Other target languages receive generic demo guidance; live mode generates mission-specific coaching for all listed languages.

## Coaching architecture

- `app/lib/coaching/contracts.ts` defines Zod schemas, request contracts, result types, and the provider-independent `CoachingService` interface.
- `app/lib/mock-ai.ts` implements the deterministic fallback provider.
- `app/lib/coaching/server/openai-coach.ts` implements the OpenAI adapter with the Responses API and Structured Outputs.
- `app/lib/coaching/server/system-prompt.ts` contains the server-only adaptive trainer prompt.
- `app/lib/coaching/server/provider.ts` selects live or demo coaching from server environment configuration.
- `app/api/coach/route.ts` validates requests, runs coaching operations, sanitizes diagnostics, and performs fallback.
- `app/components/LanguageSession.tsx` owns session state, progressive disclosure, loading, cancellation, retry, and development diagnostics.

To add another AI provider, implement `CoachingService`, validate its outputs with the shared schemas, and update `resolveCoachingService`. The UI and API contract should not need provider-specific changes.

## Checks

```bash
npm run lint
npm run build
npm test
```

The G2 client is intentionally independent from the web application toolchain:

```bash
cd clients/even-g2
npm install
npm test
npm run build
```

`npm test` builds the production worker, verifies all primary routes render, validates structured coaching and fallback behavior, exercises learner-memory derivation and migration, and checks Source Pack provenance, source-only selection, separate reading/listening evidence, pronunciation fallback/caching, Daily Exposure loop closure, and persistence.

There is intentionally no authentication, account system, analytics, payments, or external persistence in this version. Learner memory, learner-supplied Source Packs, Repeat sessions, browser-cached pronunciation, and unfinished Daily Exposure sets persist on the current device; the expression-coach session remains transient.
