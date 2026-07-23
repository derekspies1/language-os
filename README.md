# Language OS

Language OS is a focused language-learning prototype built around one idea: try to express something real before receiving the language for it. A session moves from an authentic mission through an imperfect first attempt, progressive coaching, reconstruction, a short transfer test, and a capability-focused summary.

## Learning flow

1. Choose a real mission and target language.
2. Make an unassisted first attempt.
3. Reveal coaching in three increasingly explicit levels.
4. Rebuild the thought while preserving the original attempt.
5. Answer 2–3 follow-up questions using the new language.
6. Leave with acquired words, reusable patterns, and a retrieval challenge.

The UI never receives all hints at once. The server can prepare a complete analysis, but the learner explicitly reveals each level before rebuilding.

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal.

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

`npm test` builds the production worker, verifies server rendering, validates structured coaching responses, checks missing configuration and fallback behavior, rejects malformed model output, and exercises the route with an injected provider.

There is intentionally no authentication, database, account system, analytics, payments, or external persistence in this version. Session state resets on refresh.
