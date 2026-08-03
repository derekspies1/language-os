# Language OS

Language OS is a browser-first language-learning prototype for meaningful contact, productive struggle, progressive revelation, and reuse. It currently includes an expression coach and a complete K-pop Repeat Studio.

The durable product philosophy lives in [`docs/learning-principles.md`](docs/learning-principles.md). The verified implementation map lives in [`current_state.md`](current_state.md).

## Product workflows

### Expression coach — `/`

Try to express something real before receiving the language for it. A session moves from an authentic mission through an imperfect first attempt, progressive coaching, reconstruction, a short transfer test, and a capability-focused summary.

## Learning flow

1. Choose a real mission and target language.
2. Make an unassisted first attempt.
3. Reveal coaching in three increasingly explicit levels.
4. Rebuild the thought while preserving the original attempt.
5. Answer 2–3 follow-up questions using the new language.
6. Leave with acquired words, reusable patterns, and a retrieval challenge.

The UI never receives all hints at once. The server can prepare a complete analysis, but the learner explicitly reveals each level before rebuilding.

### K-pop Repeat Studio — `/repeat`

Paste a Korean song excerpt that you want to study, then move through five evolving listening passes:

1. Listen and guess before revealing the answer.
2. Unpack segmentation, vocabulary, grammar, nuance, and sound progressively.
3. Return to a cleaner view and hear complete meaningful units.
4. Rebuild and reuse a small number of high-value trouble spots.
5. Return to the song with a compact understanding map and one next-listen focus.

Repeat Studio also includes device-local saved sessions, an original Korean demo, printable learning sheets, marked vocabulary and grammar, learner notes, and recovery from invalid or older saved data.

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal.

Open `/repeat` for K-pop Repeat Studio. The expression coach at `/` links there as well.

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

To verify the live coach:

1. Confirm the top-right badge says **LIVE COACH**.
2. Submit a mission and first attempt that differ from the README example.
3. Confirm the scaffolding refers specifically to that mission and attempt.
4. In development, expand **Development diagnostics** to see the provider, model, request state, response time, validation fields, and sanitized error state.

## Live analysis, demo mode, and fallback

When `OPENAI_API_KEY` is absent, Language OS automatically uses the deterministic mock coach and labels the interface **DEMO COACH**. If a configured live request fails or returns malformed structured output, that individual request falls back to the same mock coach. Attempts remain in browser state, and diagnostics show only sanitized failure information—never the key, raw model response, or hidden system prompt.

The expression coach's Korean demo path is complete. Other target languages receive generic demo guidance; live mode generates mission-specific coaching for all listed languages.

Repeat Studio includes original Korean demo material written specifically for Language OS. In demo mode, that material has a complete structured breakdown. Learner-supplied text remains fully usable for listening, guessing, marking, notes, and reuse, but the demo analyzer deliberately does not invent detailed meanings or grammar. A configured live provider can create the validated breakdown.

The interface always identifies whether the actual result came from live or demo analysis. A failed live request falls back per request and is never disguised as live output.

## Coaching architecture

- `app/lib/coaching/contracts.ts` defines Zod schemas, request contracts, result types, and the provider-independent `CoachingService` interface.
- `app/lib/mock-ai.ts` implements the deterministic fallback provider.
- `app/lib/coaching/server/openai-coach.ts` implements the OpenAI adapter with the Responses API and Structured Outputs.
- `app/lib/coaching/server/system-prompt.ts` contains the server-only adaptive trainer prompt.
- `app/lib/coaching/server/provider.ts` selects live or demo coaching from server environment configuration.
- `app/api/coach/route.ts` validates requests, runs coaching operations, sanitizes diagnostics, and performs fallback.
- `app/components/LanguageSession.tsx` owns session state, progressive disclosure, loading, cancellation, retry, and development diagnostics.

Repeat Studio adds:

- `app/lib/song-analysis/contracts.ts` for validated song, line, vocabulary, and grammar analysis.
- `app/lib/song-analysis/server/openai-song-analyzer.ts` for the live provider adapter and source-line integrity checks.
- `app/lib/song-analysis/demo.ts` for original demo material and conservative fallback.
- `app/api/song-analysis/route.ts` for server-side validation, cancellation, live execution, and labeled fallback.
- `app/lib/repeat-studio/session.ts` for versioned local sessions and safe stored-data recovery.
- `app/components/repeat/RepeatStudio.tsx` for the full learner workflow.

To add another AI provider, implement `CoachingService`, validate its outputs with the shared schemas, and update `resolveCoachingService`. The UI and API contract should not need provider-specific changes.

Song-analysis providers follow the same pattern through `SongAnalysisService` and `resolveSongAnalysisService`.

## Privacy, copyright, and persistence

Repeat Studio studies text supplied by the learner. It does not retrieve lyrics, scrape lyric sites, control a streaming service, download audio, or process audio.

Saved Repeat Studio sessions stay in browser local storage on the current device. Stored data is versioned and validated before loading. When live analysis is configured and requested, the pasted excerpt is sent to that configured AI provider through the server route. API keys remain server-side.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
npm test
```

`npm test` builds the production worker, verifies both main routes, validates structured coaching and song-analysis responses, checks missing configuration and fallback behavior, rejects malformed model output, and exercises saved-session validation and migration recovery.

There is intentionally no authentication, account system, analytics, payments, or cloud persistence in this version. Expression-coach state resets on refresh; Repeat Studio sessions persist on the current device.
