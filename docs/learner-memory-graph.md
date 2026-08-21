# Learner Memory Graph

## Purpose

The Learner Memory Graph is Language OS's longitudinal learning record. It models contact, interpretation, recognition, retrieval, production, confusion, and change over time. It is deliberately not a vocabulary checklist and never treats one appearance as proof that an item is learned.

The graph is connected to learner-supplied Source Packs, K-pop Repeat Studio, and the Daily Exposure Loop, then exposed in the Learning Universe at `/learn`. The contracts are language-neutral; Korean-specific deterministic normalization is the first adapter.

## Architectural decision

The current record is a versioned, validated event store in browser `localStorage`, accessed only through `LearnerMemoryRepository` and graph service functions.

This choice is intentional for the current product:

- Language OS has no account or authentication boundary. A server database would either mix learners or require inventing an unsafe identity mechanism.
- The Cloudflare D1 binding in `.openai/hosting.json` is not configured.
- Device-local storage preserves the existing zero-infrastructure, no-API-key demo experience.
- Learning history remains private by default and survives refreshes on the current browser.
- The repository contract can later be implemented by D1, SQLite, Postgres, or an encrypted sync provider without moving persistence logic into components.

This is durable device-local persistence, not synchronization. Browser storage has capacity and backup limitations. The complete JSON export is therefore also the first backup/restore format.

## Storage boundary and migrations

The current key is `language-os.learner-memory.graph`; the record schema version is 2.

`BrowserLearnerMemoryRepository` implements the storage contract. `InMemoryLearnerMemoryRepository` supports tests and future server-side composition. All reads and writes cross `LearnerMemoryRecordSchema`.

Version 1 records migrate meanings into explicit senses, preserve item IDs, notes, timestamps, and events, and annotate migrated evidence. Malformed data is never partially trusted. The browser repository preserves invalid original bytes under `language-os.learner-memory.graph.recovery` before a new validated primary record is saved.

The memory store is independent from the versioned Repeat Studio session envelope. Existing sessions are ingested idempotently when opened after this feature ships.

Daily Exposure uses a second versioned session envelope under `language-os.daily-exposure.sessions`. It preserves the selected feed, initial self-reports, reveal state, later outcomes, and completion summary inputs. The session envelope controls the open loop; the Learner Memory Graph remains the source of learning evidence and derived state.

## Data model

### Learning items

A `LearningItem` has:

- a stable deterministic ID;
- language and typed item category;
- canonical and normalized forms;
- display-preserving form variants;
- zero or more explicit senses;
- learner notes; and
- creation and update timestamps.

Supported types include lemmas, inflected forms, multiword expressions, collocations, idioms, grammar patterns, sentence frames, discourse markers, named entities, pronunciation features, confusing pairs, cultural expressions, reusable phrases, and an extension type.

An inflected form can be a separate item connected to its lemma. Forms are not erased into a lemma because recognizing `보다` does not prove that `봤어` is equally available in listening.

### Senses

Senses have their own stable IDs, glosses, usage notes, confidence, claim status, and provenance. The same canonical form can therefore retain separate evidence for meanings such as Korean `눈` meaning “snow” and `눈` meaning “eye.”

AI- or system-derived forms, senses, and relationships are marked `suggested`. Learner-confirmed information ranks above suggestions during merges. Later analysis cannot overwrite learner notes or downgrade confirmed claims.

### Relationships

Relationships are explicit records with source and target IDs, type, confidence, claim status, and provenance. The contract supports:

- inflected form, derivation, containment, and expression membership;
- synonymy, antonymy, similar meaning, and confusion;
- co-occurrence and grammar usage;
- register and nuance comparisons;
- topic, lesson, prerequisite, and supporting-concept links.

Repeat Studio currently creates `inflected_form_of` and `contains` relationships. These remain suggested when analysis produced them. There is no destructive automatic merge path.

## Identity and normalization

Stable IDs derive from `language + item type + deterministic normalized form`. Senses derive from `item ID + normalized meaning`. Relationships and idempotent evidence events also receive deterministic IDs.

The language-neutral adapter applies Unicode NFKC normalization, whitespace cleanup, edge-punctuation removal, and case folding where relevant.

The Korean adapter additionally:

- treats spacing variation as one identity key while retaining each display form;
- retains dictionary, surface, conjugated, politeness, contraction, and other variants as labeled forms;
- expands only a small allowlist of exact common contractions for inflected-form identity; and
- relies on the validated analysis contract for lemmas and grammar base patterns rather than pretending to be a full morphological analyzer.

This is intentionally conservative. Ambiguous AI normalizations should remain separate suggested items or relationships until reviewed. Future languages register their own `LanguageNormalizationAdapter` without changing the graph or event contracts.

## Append-oriented evidence

`LearningEvidenceEvent` is the source of learner state. Events are append-oriented and retain:

- event and dedupe IDs;
- item and optional sense or related-item IDs;
- timestamp and activity type;
- modality, result, and hint level when relevant;
- confidence;
- session, lesson, source title/type/reference, line, and excerpt context;
- AI-generated and learner-confirmed flags; and
- bounded primitive metadata.

The schema covers encounters, meaning reveals and guesses, listening and reading, recognition and misses, reconstruction, cued and free recall, learner-created sentences, evaluated usage, pronunciation, confusion, review, correction, merge suggestions, merges, relationship discovery, and notes.

Event `dedupeKey` is unique across the record. Analysis encounters use a stable key derived from session, line, item, and sense. Explicit Repeat actions use an action ID. Retries, reopening, re-rendering, and repeated analysis ingestion therefore cannot inflate history.

## Learner-state derivation

Learner-facing state is derived, never stored as an unsupported declaration:

| State | Minimum interpretation |
| --- | --- |
| New | One recent encounter and no stronger supported evidence |
| Encountered | Contact exists, but the item is no longer newly discovered |
| Familiar | Repeated encounters or source sessions |
| Understood in context | A meaning attempt has supported/correct evidence |
| Recognizable | Direct successful listening or reading recognition exists |
| Recallable | Independent reconstruction or free recall succeeded |
| Usable | Usage was positively evaluated; writing a sentence alone is not enough |
| Durable | At least one modality has three successful attempts on three days spanning at least fourteen days |

These states are intentionally understandable and ordinal for display, but they are not a universal mastery score.

### Modality strength

The graph separately derives listening, reading, comprehension, cued recall, free recall, production, appropriate usage, and pronunciation strength. Each receives one of:

- none;
- emerging;
- supported;
- reliable; or
- durable.

Each result reports evidence count, successful attempts, misses, distinct days, latest evidence, and a plain-language explanation. A miss can lower an emerging modality. Durability requires repeated success over time.

### Reinforcement heuristic

The initial scheduler is transparent. It adds an interval to the latest evidence based on current state: 1 day for new, 2 for encountered, 4 for familiar, 7 for contextual understanding, 10 for recognizable, 18 for recallable, 30 for usable, and 60 for durable.

The UI labels this a heuristic. It does not claim to predict memory precisely. A future scheduler can replace the interval implementation while preserving the derived-state contract and event history.

## Repeat Studio integration

When validated analysis becomes ready, Repeat Studio extracts:

- vocabulary lemmas and their contextual senses;
- distinct inflected forms when the surface differs;
- grammar patterns and used forms; and
- phrase/expression candidates from structured segments.

It then normalizes and upserts them, stores suggested relationships, and appends source-linked encounter events. Existing saved Repeat sessions are backfilled on load through the same idempotent path.

The interface shows evidence-backed item states inline and a compact item drawer without leaving the session. Repeat activity contributes evidence as follows:

- initial/current understanding self-reports record listening misses, sound contact, partial meaning, or self-reported contextual understanding;
- meaning reveals record that the answer was shown, not that it was learned;
- opening structural and vocabulary support records reading contact;
- marked trouble records confusion;
- exact reconstruction records correct or incorrect free recall;
- unscored meaning recall remains an unevaluated attempt;
- a learner-created sentence records production but does not imply appropriate usage;
- a learner-logged listen records listening contact once per item and pass.

This distinction is central: activity is preserved as evidence without turning every click into mastery.

## Daily Exposure integration

Daily Exposure turns an optional `LearningIntent` into a versioned, device-neutral `ExposureFeedSnapshot`. The companion `ExposureEvidenceInput` contract represents a meaning reveal, initial response, or later close outcome without naming a device or UI. V1 uses a deterministic local Korean seed catalog, so the loop works without an API key. The recommendation layer is isolated from the interface and returns a machine-readable reason for every item:

- `related_to_current_interest`;
- `previous_weak_encounter`;
- `reinforce_familiar_item`;
- `related_to_known_word`; or
- `new_exploration`.

The selector considers the graph's derived state and transparent reinforcement status, then fills the rest of a 10–20 item set from interest-matching and exploratory candidates. It never mutates state directly.

Source-driven items add `from_active_source`, `listening_gap`, `reading_gap`, `cross_modal_pair`, and `source_line_return` reasons. Their feed records include source-pack ID, original line, source excerpt, initial modality, and short pronunciation layers. Source mode never fills remaining space with generic seeds.

The loop contributes evidence as follows:

| Learner action | Evidence meaning |
| --- | --- |
| See and classify a word | `item_encountered`, plus reading self-report evidence |
| Listen before seeing Korean | `item_heard`, then listening-only self-report evidence |
| Reveal Korean after audio | `item_read` with `answer_shown`; not reading recognition |
| Reveal the answer | `meaning_revealed` with `answer_shown`; never recall |
| Later “Got it” | correct `recalled_without_hint` evidence |
| Later “Almost” | partial `reading_recognized` evidence |
| Later “Didn’t stick” | incorrect `recalled_without_hint` evidence |

Every event retains the exposure session, learner intent, selection reason, and interest domains. Dedupe keys prevent repeated UI actions or retries from inflating history. Completion derives each displayed state from the updated graph rather than storing a claimed mastery result.

## Source Pack integration

A Source Pack is a persisted learning source, not a vocabulary database. It retains learner-supplied title, optional artist/context, exact Korean lines, validated analysis, provider metadata, and status. Detailed analysis reuses the same `SongAnalysis` contract and request-boundary validation as Repeat Studio. Safe local mode preserves complete lines as phrase units without inventing translations.

`ingestSourcePackAnalysis` and Repeat Studio share the same extraction pipeline. Stable IDs still derive from language, item type, and normalized canonical form, so a lemma or expression from two sources merges into one underlying item while each occurrence keeps independent provenance.

Source occurrence evidence keeps:

- Source Pack ID and title;
- original line ID and exact learner-supplied excerpt;
- candidate role (lemma, form, grammar, or expression);
- compact Korean phrase containing the item; and
- analysis provider, model, confidence, and suggestion status.

Source progress is computed from those item IDs and the shared evidence history. Reading and listening recognition counts come from their separate modality strengths. Weakness means at least one relevant modality lacks supported evidence; it is not the inverse of a universal score.

## Pronunciation evidence

ElevenLabs Text to Speech sits behind a server-only `PronunciationService`. The exposure feed requests short Korean word, phrase, or source-line layers; it does not store provider credentials or generated audio inside learner memory.

Playing audio appends `item_heard` with listening modality and the requested audio layer. A listening-first self-report separately appends `listening_recognized` or `listening_missed`. Seeing the Korean after listening appends `item_read` with `answer_shown`. None of these imply meaning retrieval, which remains a separate later recall event.

## Learning Universe

`/learn` reads the same repository and provides:

- search plus language, item-type, state, and modality filters;
- recent, newly discovered, becoming-durable, and weak/confusing/due views;
- unique-item, unique-meaning, independent-recall, durable-evidence, and due counts;
- encounter activity over eight weeks;
- a complete item detail drawer with forms, senses, provenance, relationships, contexts, dates, modality evidence, explanations, timeline, and notes; and
- complete JSON and human-readable CSV exports.

When a real record is empty, the learner can open a clearly labeled, non-persisted demo preview. Demo source events remain labeled as demo.

## AI context and privacy

`LearnerContextSummarySchema` is the explicit context-selection boundary for future coaching requests. `buildLearnerContextSummary`:

- accepts one language, purpose, optional relevant forms, and a strict maximum item count;
- selects only compact known, developing, and confusing item summaries;
- includes state, a few meanings, supported modalities, and concise evidence reasons; and
- excludes event history, source excerpts, learner notes, session IDs, and the full graph.

The graph is never sent to an AI provider by default. A future coaching call must explicitly construct this bounded contract for its purpose.

## Export, import, and ownership

The complete JSON export is the canonical backup format and round-trips through `LearnerMemoryRecordSchema`. `importLearnerMemoryJson` is the validated restore/import foundation. The CSV export is a human-readable report with canonical form, language, item type, derived state, meanings, evidence counts, dates, reinforcement status, and notes.

Spreadsheet, flashcard, and legacy import adapters remain future work. They should translate external rows into proposed items/events and use the same validation and non-destructive merge rules.

## Current limitations

- Storage is device-local and does not sync across browsers.
- `localStorage` is capacity-limited; IndexedDB or a server repository will be needed for very large histories.
- Korean normalization is conservative and not a morphological parser.
- Repeat Studio currently applies line-level evidence to every extracted item in that line; future activities should target exact item spans when possible.
- Meaning recall and learner-created sentences are saved but not automatically evaluated.
- Suggested duplicate review, manual split/merge, relationship confirmation, and import UI are not implemented yet.
- The expression coach does not yet contribute events or consume learner context.
- Generic Daily Exposure remains Korean-only and uses a curated local seed catalog; Source Pack mode instead stays entirely inside the active source.
- Detailed vocabulary/meaning extraction for arbitrary learner text requires the existing configured live analyzer. Local mode safely preserves phrase units but does not invent lexical claims.
- ElevenLabs server caching is process-local and bounded; the browser Cache API supplies durable per-device reuse. There is no shared audio object store.
- Daily Exposure interest relationships are currently topic-tag neighbors, not explicit graph relationship traversal.
- Reinforcement uses a transparent interval heuristic, not a fitted memory model.
- There is no authentication, encrypted sync, or server backup.

## Recommended next phases

1. Add learner-controlled confirmation, correction, sense split, and non-destructive merge review.
2. Add exact item-scoped reconstruction and validated usage evaluation in Repeat Studio.
3. Integrate the bounded learner-context summary with expression coaching and explanation selection.
4. Add a D1-backed repository only alongside a real account/ownership boundary, with an encrypted device-local fallback and explicit sync controls.
5. Add spreadsheet/Anki-style import adapters and a restore UI with dry-run conflict review.
6. Replace the initial review interval with a calibrated scheduler once enough longitudinal evidence exists.
