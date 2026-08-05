# Language OS Current State

Last verified: 2026-08-03

## Purpose

Language OS is a browser-first language-learning prototype built around meaningful contact, productive struggle, progressive revelation, reuse, and honest longitudinal evidence. It currently offers three complementary workflows:

1. an expression coach that starts from something the learner genuinely wants to say; and
2. K-pop Repeat Studio, which turns repeated listening to learner-supplied Korean lyrics into progressively deeper comprehension; and
3. the Learning Universe, which exposes the durable Learner Memory Graph created by study activity.

The durable product philosophy is defined in `docs/learning-principles.md`.

## What existed before the K-pop Repeat Studio task

The following behavior was confirmed in the repository before this task began:

- `/` rendered a complete six-stage expression-coaching workflow: mission, unassisted attempt, three progressive hint levels, rebuild, two or three stress-test questions, and a capability summary.
- The first attempt and subsequent work were preserved in React browser state while a session was open, but all state reset on refresh.
- `app/lib/coaching/contracts.ts` defined strict Zod schemas for all coaching requests and structured responses plus a provider-independent `CoachingService` interface.
- `app/lib/coaching/server/openai-coach.ts` used the OpenAI Responses API with Structured Outputs, `store: false`, a server-only API key, and response validation.
- `app/api/coach/route.ts` validated request bodies, selected a provider, sanitized diagnostics, handled cancellation, and fell back to deterministic mock coaching after provider, network, or malformed-output failure.
- `app/components/LanguageSession.tsx` implemented live/demo indicators, loading, cancellation, duplicate-request protection, retry, attempt preservation, and development diagnostics.
- `app/lib/mock-ai.ts` provided a detailed deterministic Korean demo path and generic demo guidance for other target languages.
- Automated tests covered coaching-schema validation, provider selection, malformed live output, route fallback, injected live behavior, sanitized upstream failure, and server-rendered HTML.
- The repository used Next.js 16 with React 19 through vinext/Vite and a Cloudflare Worker entry. D1 and R2 support existed as unused starter infrastructure; `.openai/hosting.json` had both bindings set to `null`.
- There was no authentication, account system, analytics, cloud persistence, or deployed database behavior in the application workflow.

## New behavior added in this task

### K-pop Repeat Studio

`/repeat` is a complete, navigable vertical slice with:

- a Repeat Studio home and device-local saved-session library;
- song-session creation for title, artist, optional album/source note, Korean lyrics or excerpt, optional existing translation, and personal notes;
- an original six-line Korean demo created for Language OS and explicitly labeled as non-commercial demo material;
- five distinct passes: Listen & Guess, Unpack, Hear It as Language, Rebuild & Reuse, and Return to the Song;
- line-by-line understanding states: Unknown, Sounds only, Partial, Understood, and Reusable;
- preserved initial state, current state, learner interpretation, progressive reveals, marked lines, marked vocabulary and grammar, and learner notes;
- a compact, clickable understanding map for the full excerpt;
- keyboard line movement with J/K and the arrow keys when focus is not inside a form control;
- focused reconstruction, meaning recall, and personal reuse activities for up to three high-value trouble spots;
- Full Song Breakdown, Repeat Focus, Phrase Treasure, and After-Listening sheets with browser print styling;
- learner-logged completed listens that are separate from navigation between study modes;
- loading, cancellation, retry, partial-analysis, no-analysis, storage-recovery, missing-session, and empty-library states;
- explicit copyright, privacy, and provider boundaries in session creation and the Repeat Studio home.

The feature does not control music, retrieve lyrics, scrape websites, download audio, or call a streaming service.

### Song analysis architecture

`app/lib/song-analysis/contracts.ts` defines validated song-level, line-level, segment, vocabulary, and grammar contracts plus a provider-independent `SongAnalysisService`.

`app/lib/song-analysis/server/openai-song-analyzer.ts` uses the existing structured-model client with a song-specific system prompt. Shared request-specific validation rejects unknown or duplicate line IDs, changed source text, invented segment text, stale omissions, and inconsistent partial claims.

`app/api/song-analysis/route.ts` keeps credentials server-side, validates every request and every service response, supports request cancellation, uses the configured live analyzer when available, and falls back to clearly labeled deterministic demo analysis after network, provider, or validation failure. The client parses the response envelope again before writing it into session state.

`app/lib/song-analysis/demo.ts` contains the original Korean demo and its analysis. For arbitrary learner-supplied text in demo mode, it deliberately does not invent detailed meanings, vocabulary, or grammar. Supplied translations can be shown, and the listening workflow remains usable.

### Project foundation

- `docs/learning-principles.md` now records the product constitution and a practical decision test.
- This `current_state.md` records confirmed pre-task behavior, task additions, limitations, and next opportunities.
- The README now covers both product workflows, setup, live/demo behavior, local persistence, privacy, and checks.
- `public/og.png` is an original product-specific social preview card for Repeat Studio.
- The root expression coach now links to Repeat Studio, and Repeat Studio links back.

### Corrections from the senior review

The 2026-08-03 senior product and code review corrected several behaviors that had built successfully but were not reliable enough:

- changing modes no longer increments a misleading “repeat” count; a completed listen is logged only when the learner explicitly records it in Return mode;
- all five understanding states can now be recorded after initial contact, including Reusable, while preserving the learner's baseline;
- lyric entry rejects more than 80 non-empty lines and overlong lines visibly instead of silently truncating text;
- persisted session schema version 2 adds cross-field integrity checks for lyric lines, progress, analysis source text, omissions, marks, rebuild attempts, phrase reuse, and provider metadata;
- version-1 sessions retain valid learning data during migration, while old navigation-derived pass counts reset instead of becoming listening history;
- an analysis left in `loading` during a page close reloads as a retryable cancellation instead of permanent loading;
- API routes validate output even when a provider service is injected or replaced, and the browser validates response data and metadata before saving it;
- request-specific song validation rejects changed Korean, unknown or duplicate IDs, invented segments, inconsistent partial output, and stale omissions;
- deletion now has undo, reconstruction saves provide feedback, and Return mode opens the promised After-Listening Summary directly;
- Phrase Treasure selects units containing high-reuse or learner-marked vocabulary and gives every phrase its own sentence field;
- Full Song Breakdown now includes the song overview and close structural meaning;
- understanding-map targets are larger and horizontally resilient, and the 820px breakpoint gives iPad portrait a full-width listening surface.

### Learner Memory Graph

Language OS now has a versioned, validated, device-local longitudinal learning record behind repository and service contracts.

The graph provides stable learning-item, sense, relationship, and event identities; separate meanings and display-preserving form variants; provenance and confidence for suggested information; append-oriented source-linked evidence with dedupe keys; modality-specific strength; evidence-derived learner states; a transparent reinforcement heuristic; validated JSON/CSV export; version migration; and a privacy-bounded learner-context summary for future coaching.

Repeat Studio is the first complete contributor. Validated analysis extracts and normalizes vocabulary, inflected forms, grammar patterns, and phrase candidates. Existing sessions backfill idempotently. Guesses, reveals, reading support, confusion marks, exact reconstruction, unscored meaning recall, personal reuse, and logged listens contribute evidence without turning every interaction into mastery.

`/learn` provides the Learning Universe: search, language/item/state/modality filters, recent/new/durable/weak views, honest counts, encounter history, complete item detail, modality evidence, forms, senses, relationships, source contexts, notes, timelines, and export. Its demo preview is clearly labeled and not saved into the learner's real record.

## Current pages and workflows

### `/` — Expression coach

The learner chooses a real expressive mission and target language, makes an unassisted attempt, reveals up to three hints, rebuilds the thought, responds to follow-up questions, and receives a capability-focused summary. This workflow is not persisted across refreshes.

### `/repeat` — K-pop Repeat Studio

The learner can open the original demo, create a session from a pasted excerpt, resume a saved local session, or delete a saved session with immediate undo.

Creating a session immediately requests analysis. The learner can continue recording guesses while analysis loads, cancel without losing the session, or retry. Each later pass changes the study action rather than replaying the same screen. Later passes can update current understanding without erasing the initial state. The final pass restores a calm Korean-first lyric view, one suggested focus, and an explicit control for logging a completed listen.

### `/learn` — Learning Universe

The learner can explore everything currently in learner memory, inspect why each state was derived, compare modalities, trace source sessions, review suggested forms/senses/relationships, add notes, and export the record. It remains useful without an AI key and does not send the graph to a provider.

## Architecture

- **Framework:** Next.js App Router components rendered through vinext/Vite for Cloudflare Worker-compatible output.
- **UI:** React client components. The expression coach, Repeat Studio, and Learning Universe are separate feature surfaces with connected navigation.
- **Validation:** Zod validates coaching requests, song-analysis requests, all model responses, persisted Repeat Studio sessions, and the complete Learner Memory Graph.
- **AI boundary:** Browser code calls server routes only. Provider credentials never enter client bundles or use public environment variable prefixes.
- **Provider selection:** Server resolvers select OpenAI when `OPENAI_API_KEY` is present and deterministic mock services otherwise.
- **Failure policy:** Live request failures and malformed structured output fall back per request to demo behavior. Metadata states which provider actually produced the response.
- **Persistence:** Repeat Studio sessions and learner memory use separate versioned browser `localStorage` records. Learner memory is behind `LearnerMemoryRepository`; D1 and R2 remain unused because the app has no safe account/ownership boundary.
- **Deployment target:** Cloudflare Worker via the existing vinext configuration and worker entry.

## Important contracts

### Learner memory

`LearnerMemoryRecordSchema` validates the item/sense/relationship/event graph and cross-record references. `LearnerContextSummarySchema` is the bounded future AI context contract. `LanguageNormalizationAdapter` is the language-specific identity extension point, and `LearnerMemoryRepository` is the storage-provider boundary.

### Coaching

`CoachingService` supports initial-attempt analysis, rebuild evaluation, stress-question generation, stress-answer evaluation, and session-summary creation. `CoachRequestSchema` is a discriminated union over the four API actions.

### Song analysis

`SongAnalysisService.analyzeSong` receives metadata and stable input lines. `SongAnalysisSchema` returns a song overview, recurring language and style, priorities, validated line analyses, and explicit partial-output fields.

Every analyzed line carries its stable input ID and unchanged source Korean plus meaning, structural reading, segments, selective vocabulary, selective grammar, a listening cue, nuance, optional cultural context, and review priority.

## Live and demo behavior

With `OPENAI_API_KEY` configured:

- coaching and song analysis use the server-side OpenAI Responses API adapter;
- structured output is validated before reaching UI state;
- pasted lyrics are sent to the configured provider only when analysis is requested;
- the interface labels successful live results as live analysis or live coaching.

Without `OPENAI_API_KEY`:

- both features use deterministic mock providers;
- the interface explicitly labels demo mode;
- the original Repeat Studio demo has rich analysis;
- learner-supplied lyrics remain studyable, but demo mode does not fabricate a detailed translation or linguistic breakdown.

If a configured live request fails or returns invalid output, that request falls back to mock data and carries a sanitized fallback message. The UI never represents fallback output as live output.

## Persistence and migration behavior

Repeat Studio stores one versioned envelope under `language-os.repeat-studio.sessions` in browser local storage. Stored data includes song metadata and text, analysis and provider metadata, learner-logged listen count, selected line, initial and current understanding, interpretations, reveal state, marks, notes, rebuild attempts, reuse sentences, and timestamps.

On load:

1. every session is validated for both shape and relationships among lyrics, analysis, progress, marks, activities, and provider metadata;
2. valid version-2 data loads normally;
3. valid version-1 data preserves its learning record while migrating, with old navigation-derived pass counts reset to zero;
4. interrupted loading state becomes a retryable cancellation;
5. recognizable older array or envelope shapes recover only safe core song fields and regenerate valid progress state;
6. invalid or unsupported sessions are ignored with a visible warning instead of crashing the app.

Sessions stay on the current browser/device. There is no cloud synchronization, account ownership, or server persistence.

Learner memory stores a version-2 record under `language-os.learner-memory.graph`. Version-1 meanings migrate into explicit senses while notes, IDs, timestamps, and evidence are preserved. Invalid original bytes are preserved under `language-os.learner-memory.graph.recovery` before a new primary record is written. Unique dedupe keys prevent repeat renders, retries, and reopened analyses from inflating event history.

## Environment requirements

- Node.js 22.13 or newer
- `npm install`
- optional server-only `OPENAI_API_KEY`
- optional `OPENAI_MODEL` (defaults to `gpt-5-mini`)

The key must not use a `NEXT_PUBLIC_` prefix. `.env.example` is the canonical environment template.

## Important files

- `app/components/LanguageSession.tsx` — original expression-coach workflow
- `app/components/repeat/RepeatStudio.tsx` — Repeat Studio UI and interaction orchestration
- `app/repeat/repeat.css` — Repeat Studio responsive and print visual system
- `app/lib/coaching/contracts.ts` — coaching schemas and service contract
- `app/lib/coaching/server/openai-coach.ts` — shared structured-model client and OpenAI coaching adapter
- `app/api/coach/route.ts` — coaching validation, execution, and fallback boundary
- `app/lib/song-analysis/contracts.ts` — song-analysis schemas and provider-neutral contract
- `app/lib/song-analysis/demo.ts` — original Korean demo and conservative fallback behavior
- `app/lib/song-analysis/server/openai-song-analyzer.ts` — live song-analysis adapter and cross-line integrity checks
- `app/api/song-analysis/route.ts` — song-analysis API validation and fallback
- `app/lib/repeat-studio/session.ts` — session model, lyric splitting, persistence validation, and migration recovery
- `app/lib/learner-memory/contracts.ts` — graph, event, state, and coaching-context schemas
- `app/lib/learner-memory/normalization.ts` — stable identity and language adapters
- `app/lib/learner-memory/repository.ts` — versioned persistence, recovery, and migrations
- `app/lib/learner-memory/service.ts` — non-destructive merge, derived state, context selection, and export/import
- `app/lib/learner-memory/repeat-integration.ts` — Repeat candidate extraction and evidence capture
- `app/components/learning/LearningUniverse.tsx` — Learning Universe exploration and item detail
- `docs/learner-memory-graph.md` — data model, heuristics, privacy, limitations, and roadmap
- `tests/learner-memory.test.ts` — normalization, identity, evidence, state, export, context, and migration tests
- `tests/coaching.test.ts` — original coaching behavior tests
- `tests/repeat-studio.test.ts` — analysis, fallback, and persistence tests
- `tests/rendered-html.test.mjs` — production worker route rendering tests
- `docs/learning-principles.md` — durable product constitution

## Verification status

Verified on 2026-08-03:

- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed
- `npm test` — passed, 35 tests

The test command performs another production build before running tests.

A manual browser walkthrough also passed in demo mode: session resume after reload, recoverable deletion, 81-line rejection, guess preservation, independent meaning/structure reveal, later-state improvement through Reusable, vocabulary and grammar marking, reconstruction feedback, reuse persistence, learner-logged listens, direct summary navigation, all four learning sheets, and browser-console inspection. Responsive checks at 1024×768 and 768×1024 found no page-level horizontal overflow; iPad portrait uses the compact pass rail and 40px understanding-map targets.

The Learner Memory Graph browser pass also verified the empty and populated Learning Universe, search and state filters, item detail, the Repeat inline memory signal and drawer, confusion-event capture, route/reload persistence, demo-source provenance, JSON/CSV controls, desktop layout, and a 390×844 mobile viewport. No page-level horizontal overflow or browser-console errors were found.

## Known limitations

- Learner memory is device-local and can be lost if browser storage is cleared without a JSON backup.
- Browser local storage will not scale indefinitely; a larger local store or authenticated sync repository is a later phase.
- Korean normalization is conservative and relies on validated analysis for lemmas; it is not a full morphological analyzer.
- Line-level Repeat evidence currently fans out to every extracted item in that line. Exact item-scoped exercises are a later refinement.
- Meaning recall and learner-created sentences are intentionally unevaluated unless stronger evidence exists.
- Manual sense split/merge, duplicate review, relationship confirmation, import UI, and cloud sync are deferred.
- The expression coach does not yet write memory events or consume the bounded learner-context summary.
- Repeat Studio sessions are limited to one browser and can be lost if browser storage is cleared.
- Local storage has browser-specific capacity limits; long lyrics and many analyzed sessions may eventually exceed them.
- There is no editing flow for song metadata or lyrics after session creation. A changed excerpt currently requires a new session.
- Demo analysis is intentionally rich only for the original in-app material. It cannot provide a trustworthy linguistic analysis of arbitrary pasted lyrics.
- Rebuild activities use lightweight exact-phrase checks or learner-recorded completion, not AI evaluation.
- Phrase Treasure selection is a deterministic vocabulary-to-segment heuristic; it does not yet let the learner manually promote an arbitrary phrase.
- Understanding states are learner-reported and contextual, not scientific measurements.
- The live song prompt and schemas are tested with injected/failing services, but no real provider request was made during this task because no credential-dependent verification was claimed.
- The browser print views are styled and production-built, but printer-specific pagination varies by browser.
- There is no conversational follow-up interface for song lines yet.
- The unused D1 starter helper remains in the repository but has no table schema or runtime binding.

## Technical debt

- `RepeatStudio.tsx` is a large vertical-slice component. Once behavior stabilizes, extracting mode and sheet components into feature-local modules would improve maintainability without changing the product.
- Learner-memory and Repeat session stores validate and rewrite full local envelopes. IndexedDB or a batched repository will be preferable when history becomes large.
- The reinforcement scheduler is a transparent interval heuristic, not a calibrated forgetting model.
- Local persistence writes the validated session envelope after every state change. Debouncing writes may help for very large session libraries.
- Stored analyses do not yet have a separate prompt/schema revision identifier for selective re-analysis.
- There is no committed automated browser test for local storage, keyboard navigation, responsive layout, or print switching; those paths were manually exercised in this review but remain regression risks.
- D1 and Drizzle starter files may confuse future contributors because current product persistence is intentionally local.

## Next logical product opportunities

### Highest impact

1. Add learner-controlled confirmation, correction, sense split, and non-destructive duplicate/merge review.
2. Add exact item-scoped reconstruction and validated usage evaluation, then integrate the bounded learner context with coaching.
3. Add selective re-analysis and editable excerpts with analysis-version migration, plus committed browser interaction coverage.

### Future possibilities, not current behavior

- opt-in cloud synchronization and accounts;
- advanced spaced retrieval across songs;
- spreadsheet and flashcard import with dry-run conflict review;
- section labels such as verse, pre-chorus, and chorus;
- learner-controlled analysis depth or line-scoped live analysis;
- cross-song phrase and grammar collections;
- conversational coaching grounded in marked phrases.

These are possibilities only. No streaming integration, scraping, lyric retrieval, or audio processing is planned by implication.
