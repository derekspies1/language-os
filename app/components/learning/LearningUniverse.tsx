"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ITEM_TYPE_LABELS,
  LEARNER_STATE_LABELS,
  MODALITY_LABELS,
  type DerivedItemKnowledge,
  type LearnerMemoryRecord,
  type LearnerState,
  type LearningItem,
  type LearningItemType,
  type LearningModality,
} from "../../lib/learner-memory/contracts";
import { createDemoLearnerMemory } from "../../lib/learner-memory/demo";
import { useLearnerMemory } from "../../lib/learner-memory/use-learner-memory";
import { deriveItemKnowledge, exportLearnerMemoryCsv, exportLearnerMemoryJson } from "../../lib/learner-memory/service";

type KnowledgeEntry = { item: LearningItem; knowledge: DerivedItemKnowledge };

const ALL_STATES = Object.keys(LEARNER_STATE_LABELS) as LearnerState[];
const ALL_MODALITIES = Object.keys(MODALITY_LABELS) as LearningModality[];

export function LearningUniverse() {
  const memory = useLearnerMemory();
  const [previewDemo, setPreviewDemo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [itemType, setItemType] = useState<LearningItemType | "all">("all");
  const [learnerState, setLearnerState] = useState<LearnerState | "all">("all");
  const [modality, setModality] = useState<LearningModality | "all">("all");
  const demoRecord = useMemo(() => createDemoLearnerMemory(), []);
  const record = previewDemo ? demoRecord : memory.record;
  const [now] = useState(() => new Date().toISOString());

  const entries = useMemo(() => record.items.map((item) => ({ item, knowledge: deriveItemKnowledge(record, item.id, now) })), [record, now]);
  const languages = useMemo(() => [...new Set(record.items.map((item) => item.language))].sort(), [record.items]);
  const visible = useMemo(() => entries.filter(({ item, knowledge }) => {
    const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
    const matchesQuery = !needle || [item.canonicalForm, item.notes, ...item.forms.map((form) => form.text), ...item.senses.flatMap((sense) => [sense.gloss, sense.usageNote ?? ""])].some((value) => value.toLocaleLowerCase().includes(needle));
    const matchesModality = modality === "all" || knowledge.modalities[modality].evidenceCount > 0;
    return matchesQuery && (language === "all" || item.language === language) && (itemType === "all" || item.type === itemType) && (learnerState === "all" || knowledge.state === learnerState) && matchesModality;
  }).sort((a, b) => new Date(b.knowledge.lastEncounterAt ?? b.item.updatedAt).getTime() - new Date(a.knowledge.lastEncounterAt ?? a.item.updatedAt).getTime()), [entries, itemType, language, learnerState, modality, query]);

  const selected = selectedId ? entries.find((entry) => entry.item.id === selectedId) ?? null : null;
  const metrics = useMemo(() => buildMetrics(entries), [entries]);
  const recent = entries.filter(({ knowledge }) => knowledge.lastEncounterAt).sort((a, b) => new Date(b.knowledge.lastEncounterAt!).getTime() - new Date(a.knowledge.lastEncounterAt!).getTime()).slice(0, 5);
  const newItems = entries.filter(({ knowledge }) => knowledge.state === "new").slice(0, 5);
  const becomingDurable = entries.filter(({ knowledge }) => ["recallable", "usable"].includes(knowledge.state) && Object.values(knowledge.modalities).some((value) => value.level === "reliable")).slice(0, 5);
  const weak = entries.filter(({ knowledge }) => knowledge.confusing || knowledge.weakening || knowledge.dueForReinforcement).sort((a, b) => Number(b.knowledge.confusing) - Number(a.knowledge.confusing)).slice(0, 6);
  const timeline = useMemo(() => encounterBuckets(record, now), [record, now]);

  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === "Escape") setSelectedId(null); }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function download(kind: "json" | "csv") {
    const content = kind === "json" ? exportLearnerMemoryJson(record) : exportLearnerMemoryCsv(record, now);
    const type = kind === "json" ? "application/json" : "text/csv";
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `language-os-learner-memory.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!memory.hydrated) return <main className="universe-app universe-loading"><i /><p>Opening your learning universe…</p></main>;

  return <main className="universe-app">
    <header className="universe-topbar">
      <Link className="universe-brand" href="/"><span>L/</span><div><b>LANGUAGE OS</b><small>LEARNING UNIVERSE</small></div></Link>
      <nav><Link href="/repeat">Repeat Studio</Link><Link href="/">Expression coach</Link><span>LOCAL MEMORY · PRIVATE BY DEFAULT</span></nav>
    </header>

    {memory.warning && <div className="universe-warning" role="status"><span>{memory.warning}</span><button type="button" onClick={memory.dismissWarning}>Dismiss</button></div>}
    {previewDemo && <div className="demo-ribbon"><span>DEMO PREVIEW · NOT PART OF YOUR RECORD</span><button type="button" onClick={() => { setPreviewDemo(false); setSelectedId(null); window.scrollTo(0, 0); }}>Return to my memory</button></div>}

    {record.items.length === 0 ? <EmptyUniverse onPreview={() => { setPreviewDemo(true); window.scrollTo(0, 0); }} /> : <>
      <section className="universe-hero">
        <div className="universe-title"><p>나의 언어 우주</p><h1>A record of contact.<br /><em>Not a list of conquered words.</em></h1><p>Every item is backed by evidence. Reading, listening, recall, and use can grow at different speeds—and can weaken again.</p></div>
        <div className="metric-constellation">
          <Metric value={metrics.items} label="unique items encountered" />
          <Metric value={metrics.meanings} label="distinct meanings" />
          <Metric value={metrics.recalled} label="recalled independently" />
          <Metric value={metrics.durable} label="with durable evidence" />
          <Metric value={metrics.due} label="due for reinforcement" tone={metrics.due ? "warm" : undefined} />
        </div>
      </section>

      <section className="universe-pulse">
        <div><span>CONTACT OVER THE LAST 8 WEEKS</span><p>Encounters are shown as exposure, not mastery.</p></div>
        <div className="pulse-bars" aria-label="Weekly encounters">{timeline.map((bucket) => <div key={bucket.label}><i style={{ height: `${Math.max(5, bucket.ratio * 100)}%` }} /><small>{bucket.label}</small><b>{bucket.count}</b></div>)}</div>
      </section>

      <section className="orbit-sections">
        <Orbit title="Recently encountered" subtitle="The freshest source-linked evidence" entries={recent} empty="No recent evidence." onSelect={setSelectedId} />
        <Orbit title="Newly discovered" subtitle="One recent encounter; knowledge not assumed" entries={newItems} empty="No items are new today." onSelect={setSelectedId} />
        <Orbit title="Becoming durable" subtitle="Repeated support, not permanence" entries={becomingDurable} empty="Nothing has repeated support across enough days yet." onSelect={setSelectedId} />
        <Orbit title="Weak, due, or confusing" subtitle="Useful uncertainty that deserves another look" entries={weak} empty="No weak or due items are currently visible." onSelect={setSelectedId} accent />
      </section>

      <section className="universe-library">
        <header><div><p>THE LIVING RECORD</p><h2>Explore every item</h2></div><div className="export-actions"><button type="button" onClick={() => download("csv")}>Human-readable CSV</button><button type="button" onClick={() => download("json")}>Complete JSON backup</button></div></header>
        <div className="memory-filters">
          <label className="memory-search"><span>SEARCH</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Form, meaning, note…" /></label>
          <Filter label="LANGUAGE" value={language} onChange={setLanguage} options={[{ value: "all", label: "All languages" }, ...languages.map((value) => ({ value, label: languageName(value) }))]} />
          <Filter label="ITEM TYPE" value={itemType} onChange={(value) => setItemType(value as LearningItemType | "all")} options={[{ value: "all", label: "All item types" }, ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <Filter label="LEARNER STATE" value={learnerState} onChange={(value) => setLearnerState(value as LearnerState | "all")} options={[{ value: "all", label: "All states" }, ...ALL_STATES.map((value) => ({ value, label: LEARNER_STATE_LABELS[value] }))]} />
          <Filter label="MODALITY" value={modality} onChange={(value) => setModality(value as LearningModality | "all")} options={[{ value: "all", label: "Any modality" }, ...ALL_MODALITIES.map((value) => ({ value, label: MODALITY_LABELS[value] }))]} />
        </div>
        <div className="filter-summary"><span>{visible.length} of {entries.length} items</span>{(query || language !== "all" || itemType !== "all" || learnerState !== "all" || modality !== "all") && <button type="button" onClick={() => { setQuery(""); setLanguage("all"); setItemType("all"); setLearnerState("all"); setModality("all"); }}>Clear filters</button>}</div>
        {visible.length ? <div className="item-field">{visible.map((entry) => <ItemCard key={entry.item.id} entry={entry} onSelect={setSelectedId} />)}</div> : <div className="no-results"><p>No item matches this view.</p><button type="button" onClick={() => { setQuery(""); setLanguage("all"); setItemType("all"); setLearnerState("all"); setModality("all"); }}>Reset the lens</button></div>}
      </section>
    </>}

    {selected && <ItemDetail key={selected.item.id} entry={selected} record={record} preview={previewDemo} onClose={() => setSelectedId(null)} onNote={(notes) => memory.setItemNote(selected.item.id, notes)} onSelectRelated={setSelectedId} />}
  </main>;
}

function EmptyUniverse({ onPreview }: { onPreview: () => void }) {
  return <section className="empty-universe"><div><p>아직 첫 별이 뜨기 전</p><h1>Your universe begins<br />with real contact.</h1><p>Analyze an excerpt in Repeat Studio. Language OS will normalize its words, forms, grammar, and expressions, then preserve evidence as you guess, reveal, listen, rebuild, and reuse.</p><div><Link href="/repeat">Begin in Repeat Studio <span>→</span></Link><button type="button" onClick={onPreview}>Preview a clearly labeled demo universe</button></div></div><aside><span>WHAT WILL APPEAR HERE</span><ul><li>Items and separate meanings</li><li>Reading and listening evidence</li><li>Recall and personal-use attempts</li><li>Source-linked history</li><li>Relationships and confusions</li></ul><small>Your record stays in this browser and is not sent to an AI provider by default.</small></aside></section>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return <div className={tone ?? ""}><strong>{value}</strong><span>{label}</span></div>;
}

function Orbit({ title, subtitle, entries, empty, onSelect, accent }: { title: string; subtitle: string; entries: KnowledgeEntry[]; empty: string; onSelect: (id: string) => void; accent?: boolean }) {
  return <article className={`orbit ${accent ? "accent" : ""}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div><span>{String(entries.length).padStart(2, "0")}</span></header>{entries.length ? <div>{entries.map(({ item, knowledge }) => <button key={item.id} type="button" onClick={() => onSelect(item.id)}><span lang={item.language}>{item.canonicalForm}</span><small>{LEARNER_STATE_LABELS[knowledge.state]}</small><i>{knowledge.lastEncounterAt ? shortDate(knowledge.lastEncounterAt) : "No evidence"}</i></button>)}</div> : <p className="orbit-empty">{empty}</p>}</article>;
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function ItemCard({ entry: { item, knowledge }, onSelect }: { entry: KnowledgeEntry; onSelect: (id: string) => void }) {
  const strongest = Object.values(knowledge.modalities).sort((a, b) => strengthOrder(b.level) - strengthOrder(a.level))[0];
  return <button className="memory-item" type="button" onClick={() => onSelect(item.id)}>
    <div className="item-signal"><i data-state={knowledge.state} /><span>{ITEM_TYPE_LABELS[item.type]}</span></div>
    <h3 lang={item.language}>{item.canonicalForm}</h3>
    <p>{item.senses[0]?.gloss ?? "Meaning not yet described"}</p>
    <div className="item-evidence"><span>{LEARNER_STATE_LABELS[knowledge.state]}</span><small>{knowledge.evidenceCount} evidence events</small></div>
    <footer><span>{strongest && strongest.level !== "none" ? `${MODALITY_LABELS[strongest.modality]} · ${strongest.level}` : "Exposure only"}</span>{knowledge.confusing && <b>CONFUSING</b>}{knowledge.dueForReinforcement && <b>DUE</b>}</footer>
  </button>;
}

function ItemDetail({ entry: { item, knowledge }, record, preview, onClose, onNote, onSelectRelated }: { entry: KnowledgeEntry; record: LearnerMemoryRecord; preview: boolean; onClose: () => void; onNote: (notes: string) => void; onSelectRelated: (id: string) => void }) {
  const [note, setNote] = useState(item.notes);
  const events = record.events.filter((event) => event.itemId === item.id).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const relationships = record.relationships.filter((relationship) => relationship.sourceItemId === item.id || relationship.targetItemId === item.id);
  const sources = uniqueBy(events.filter((event) => event.context.sourceTitle), (event) => `${event.context.sessionId}:${event.context.lineId}`);
  return <div className="detail-scrim" role="dialog" aria-modal="true" aria-label={`Learner memory for ${item.canonicalForm}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="item-detail">
      <header><div><span>{ITEM_TYPE_LABELS[item.type]} · {languageName(item.language)}</span><h1 lang={item.language}>{item.canonicalForm}</h1><p>{LEARNER_STATE_LABELS[knowledge.state]} · derived from {knowledge.evidenceCount} evidence events</p></div><button type="button" onClick={onClose} aria-label="Close item detail">×</button></header>
      <section className="why-state"><span>WHY LANGUAGE OS SAYS THIS</span>{knowledge.explanation.map((reason) => <p key={reason}>{reason}</p>)}{knowledge.nextReinforcementAt && <small>Transparent reinforcement date: {longDate(knowledge.nextReinforcementAt)}. This is a heuristic, not a guarantee of forgetting.</small>}</section>
      <section><div className="detail-heading"><span>STRENGTH BY MODALITY</span><small>No universal mastery score</small></div><div className="modality-grid">{ALL_MODALITIES.map((modality) => { const strength = knowledge.modalities[modality]; return <div key={modality}><header><span>{MODALITY_LABELS[modality]}</span><b>{strength.level}</b></header><i><em style={{ width: `${strengthOrder(strength.level) * 25}%` }} /></i><p>{strength.explanation}</p></div>; })}</div></section>
      <section className="detail-two"><div><span>MEANINGS & SENSES</span>{item.senses.length ? item.senses.map((sense) => <article key={sense.id}><h3>{sense.gloss}</h3>{sense.usageNote && <p>{sense.usageNote}</p>}<small>{sense.status === "suggested" ? "AI/system suggested · reviewable" : sense.status.replaceAll("_", " ")} · {Math.round(sense.confidence * 100)}% source confidence</small></article>) : <p>No sense has been described yet.</p>}</div><div><span>FORMS & VARIATIONS</span>{item.forms.length ? item.forms.map((form) => <article key={`${form.kind}:${form.normalized}`}><h3 lang={item.language}>{form.text}</h3><p>{form.kind.replaceAll("_", " ")}</p><small>{form.status === "suggested" ? "Suggested, not learner-confirmed" : form.status.replaceAll("_", " ")}</small></article>) : <p>No additional forms stored.</p>}</div></section>
      <section><div className="detail-heading"><span>RELATIONSHIPS</span><small>Suggestions retain provenance</small></div>{relationships.length ? <div className="relationship-list">{relationships.map((relationship) => { const outbound = relationship.sourceItemId === item.id; const relatedId = outbound ? relationship.targetItemId : relationship.sourceItemId; const related = record.items.find((candidate) => candidate.id === relatedId); return <button type="button" key={relationship.id} onClick={() => onSelectRelated(relatedId)}><small>{outbound ? relationship.type.replaceAll("_", " ") : `is ${relationship.type.replaceAll("_", " ")} ←`}</small><b lang={related?.language}>{related?.canonicalForm ?? "Missing item"}</b><span>{relationship.status} · {Math.round(relationship.confidence * 100)}%</span></button>; })}</div> : <p className="detail-empty">No relationships stored yet.</p>}</section>
      <section><div className="detail-heading"><span>EXAMPLE CONTEXTS & SOURCES</span><small>{knowledge.firstEncounterAt ? `First ${longDate(knowledge.firstEncounterAt)} · latest ${longDate(knowledge.lastEncounterAt!)}` : "No dated contact"}</small></div>{sources.length ? <div className="source-list">{sources.map((event) => { const demoSource = record.demoData || events.some((candidate) => candidate.context.sessionId === event.context.sessionId && candidate.context.lineId === event.context.lineId && candidate.context.sourceType === "demo"); return <article key={`${event.context.sessionId}:${event.context.lineId}`}><span>{event.context.sourceTitle}{demoSource ? " · DEMO SOURCE" : ""}</span>{event.context.sourceExcerpt && <p lang={item.language}>{event.context.sourceExcerpt}</p>}<small>{longDate(event.occurredAt)} · {event.activityType.replaceAll("_", " ")}</small></article>; })}</div> : <p className="detail-empty">No source context stored.</p>}</section>
      <section><div className="detail-heading"><span>EVIDENCE TIMELINE</span><small>Append-oriented history</small></div><div className="event-timeline">{events.map((event) => <article key={event.id}><i /><div><header><b>{eventLabel(event.type)}</b><span>{longDate(event.occurredAt)}</span></header><p>{[event.modality ? MODALITY_LABELS[event.modality] : "", event.result?.replaceAll("_", " ") ?? "", event.hintLevel ? `${event.hintLevel.replaceAll("_", " ")} hint` : ""].filter(Boolean).join(" · ")}</p><small>{event.aiGenerated ? "AI-generated evidence metadata" : event.learnerConfirmed ? "Learner action" : "System record"}{event.context.sourceTitle ? ` · ${event.context.sourceTitle}` : ""}</small></div></article>)}</div></section>
      <section className="item-notes"><span>LEARNER NOTES</span><textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (!preview) onNote(note); }} disabled={preview} maxLength={4000} rows={4} placeholder="Add a memory hook, distinction, or personal note…" /><small>{preview ? "Demo notes are read-only and are never added to your record." : "Saved locally when you leave this field."}</small></section>
    </article>
  </div>;
}

function buildMetrics(entries: KnowledgeEntry[]) {
  return {
    items: entries.length,
    meanings: entries.reduce((sum, entry) => sum + entry.item.senses.length, 0),
    recalled: entries.filter(({ knowledge }) => ["recallable", "usable", "durable"].includes(knowledge.state)).length,
    durable: entries.filter(({ knowledge }) => knowledge.state === "durable").length,
    due: entries.filter(({ knowledge }) => knowledge.dueForReinforcement).length,
  };
}

function encounterBuckets(record: LearnerMemoryRecord, now: string) {
  const end = new Date(now);
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(end.getTime() - (7 - index) * 7 * 86_400_000);
    const endOfBucket = new Date(start.getTime() + 7 * 86_400_000);
    const count = record.events.filter((event) => event.type === "item_encountered" && new Date(event.occurredAt) >= start && new Date(event.occurredAt) < endOfBucket).length;
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, count };
  });
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket) => ({ ...bucket, ratio: bucket.count / maximum }));
}

function strengthOrder(level: string) { return ["none", "emerging", "supported", "reliable", "durable"].indexOf(level); }
function languageName(language: string) { return ({ ko: "Korean", de: "German", ja: "Japanese", es: "Spanish", tl: "Tagalog" } as Record<string, string>)[language] ?? language.toUpperCase(); }
function shortDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)); }
function longDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function uniqueBy<T>(values: T[], key: (value: T) => string) { const seen = new Set<string>(); return values.filter((value) => { const id = key(value); if (seen.has(id)) return false; seen.add(id); return true; }); }
function eventLabel(type: string) { return type.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "); }
