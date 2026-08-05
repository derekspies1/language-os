import { z } from "zod";
import {
  LEARNER_MEMORY_SCHEMA_VERSION,
  LEARNER_MEMORY_STORAGE_KEY,
  LearnerMemoryRecordSchema,
  LearningItemTypeSchema,
  EvidenceEventTypeSchema,
  LearningModalitySchema,
  type LearnerMemoryRecord,
} from "./contracts";
import { makeSenseId, normalizeMeaning } from "./normalization";

export type LearnerMemoryLoadResult = {
  record: LearnerMemoryRecord;
  warning: string | null;
  migrated: boolean;
  recoveryRequired: boolean;
};

export interface LearnerMemoryRepository {
  load(): Promise<LearnerMemoryLoadResult>;
  save(record: LearnerMemoryRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createRecordId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `memory-${Date.now()}`;
}

export function createEmptyLearnerMemory(now = new Date().toISOString(), recordId = createRecordId()): LearnerMemoryRecord {
  return LearnerMemoryRecordSchema.parse({
    schemaVersion: LEARNER_MEMORY_SCHEMA_VERSION,
    recordId,
    demoData: false,
    items: [],
    relationships: [],
    events: [],
    createdAt: now,
    updatedAt: now,
  });
}

const MemoryV1ItemSchema = z.object({
  id: z.string().min(1).max(120),
  language: z.string().min(2).max(35),
  type: LearningItemTypeSchema,
  canonicalForm: z.string().min(1).max(600),
  normalizedForm: z.string().min(1).max(600),
  meanings: z.array(z.string().min(1).max(1_000)).max(100),
  notes: z.string().max(4_000).default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const MemoryV1EventSchema = z.object({
  id: z.string().min(1).max(160),
  dedupeKey: z.string().min(1).max(500),
  itemId: z.string().min(1).max(120),
  type: EvidenceEventTypeSchema,
  occurredAt: z.string().datetime(),
  modality: LearningModalitySchema.optional(),
});

const MemoryV1Schema = z.object({
  schemaVersion: z.literal(1),
  recordId: z.string().min(1).max(120),
  items: z.array(MemoryV1ItemSchema),
  events: z.array(MemoryV1EventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

function migrateV1(input: z.infer<typeof MemoryV1Schema>): LearnerMemoryRecord {
  const migratedAt = input.updatedAt;
  const items = input.items.map((item) => ({
    id: item.id,
    language: item.language,
    type: item.type,
    canonicalForm: item.canonicalForm,
    normalizedForm: item.normalizedForm,
    forms: [],
    senses: item.meanings.map((gloss) => ({
      id: makeSenseId(item.id, item.language, gloss),
      gloss,
      normalizedGloss: normalizeMeaning(item.language, gloss),
      status: "system_confirmed" as const,
      confidence: 1,
      provenance: { origin: "system" as const, source: "learner-memory-v1-migration", createdAt: migratedAt },
      createdAt: item.createdAt,
    })),
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return LearnerMemoryRecordSchema.parse({
    schemaVersion: LEARNER_MEMORY_SCHEMA_VERSION,
    recordId: input.recordId,
    demoData: false,
    items,
    relationships: [],
    events: input.events.map((event) => ({
      ...event,
      activityType: "migrated_learning_activity",
      confidence: 0.75,
      context: { sourceType: "import" as const },
      aiGenerated: false,
      learnerConfirmed: false,
      metadata: { migratedFromSchema: 1 },
    })),
    createdAt: input.createdAt,
    updatedAt: migratedAt,
  });
}

export function parseStoredLearnerMemory(raw: string | null, now = new Date().toISOString()): LearnerMemoryLoadResult {
  if (!raw) return { record: createEmptyLearnerMemory(now), warning: null, migrated: false, recoveryRequired: false };
  try {
    const decoded: unknown = JSON.parse(raw);
    const current = LearnerMemoryRecordSchema.safeParse(decoded);
    if (current.success) return { record: current.data, warning: null, migrated: false, recoveryRequired: false };

    const previous = MemoryV1Schema.safeParse(decoded);
    if (previous.success) {
      return {
        record: migrateV1(previous.data),
        warning: "Your Learner Memory Graph was safely upgraded to the current format.",
        migrated: true,
        recoveryRequired: false,
      };
    }

    return {
      record: createEmptyLearnerMemory(now),
      warning: "Saved learner memory could not be validated. It was left untouched and a new in-memory record was opened.",
      migrated: false,
      recoveryRequired: true,
    };
  } catch {
    return {
      record: createEmptyLearnerMemory(now),
      warning: "Saved learner memory was invalid. It was left untouched and a new in-memory record was opened.",
      migrated: false,
      recoveryRequired: true,
    };
  }
}

export function serializeLearnerMemory(record: LearnerMemoryRecord): string {
  return JSON.stringify(LearnerMemoryRecordSchema.parse(record));
}

export class BrowserLearnerMemoryRepository implements LearnerMemoryRepository {
  constructor(private readonly storage: KeyValueStorage, private readonly key = LEARNER_MEMORY_STORAGE_KEY) {}

  async load(): Promise<LearnerMemoryLoadResult> {
    const raw = this.storage.getItem(this.key);
    const result = parseStoredLearnerMemory(raw);
    if (result.recoveryRequired && raw) {
      const recoveryKey = `${this.key}.recovery`;
      if (!this.storage.getItem(recoveryKey)) this.storage.setItem(recoveryKey, raw);
      return { ...result, warning: `${result.warning} The original bytes were preserved under ${recoveryKey}.` };
    }
    return result;
  }

  async save(record: LearnerMemoryRecord): Promise<void> {
    this.storage.setItem(this.key, serializeLearnerMemory(record));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

export class InMemoryLearnerMemoryRepository implements LearnerMemoryRepository {
  private raw: string | null;

  constructor(initial?: LearnerMemoryRecord) {
    this.raw = initial ? serializeLearnerMemory(initial) : null;
  }

  async load(): Promise<LearnerMemoryLoadResult> {
    return parseStoredLearnerMemory(this.raw);
  }

  async save(record: LearnerMemoryRecord): Promise<void> {
    this.raw = serializeLearnerMemory(record);
  }

  async clear(): Promise<void> {
    this.raw = null;
  }
}
