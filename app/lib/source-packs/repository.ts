import {
  SOURCE_PACK_SCHEMA_VERSION,
  SOURCE_PACK_STORAGE_KEY,
  SourcePackEnvelopeSchema,
  SourcePackSchema,
  type SourcePack,
} from "./contracts";
import type { KeyValueStorage } from "../learner-memory/repository";

export function parseSourcePacks(raw: string | null): { packs: SourcePack[]; warning: string | null } {
  if (!raw) return { packs: [], warning: null };
  try {
    const parsed = SourcePackEnvelopeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { packs: parsed.data.packs, warning: null };
  } catch { /* reported below */ }
  return { packs: [], warning: "Saved Source Packs could not be validated and were left out." };
}

export class BrowserSourcePackRepository {
  constructor(private readonly storage: KeyValueStorage, private readonly key = SOURCE_PACK_STORAGE_KEY) {}

  async load() { return parseSourcePacks(this.storage.getItem(this.key)); }

  async save(pack: SourcePack) {
    const validated = SourcePackSchema.parse(pack);
    const current = parseSourcePacks(this.storage.getItem(this.key)).packs;
    const packs = [validated, ...current.filter((candidate) => candidate.id !== validated.id)].slice(0, 100);
    this.storage.setItem(this.key, JSON.stringify(SourcePackEnvelopeSchema.parse({ schemaVersion: SOURCE_PACK_SCHEMA_VERSION, packs })));
  }

  async delete(packId: string) {
    const packs = parseSourcePacks(this.storage.getItem(this.key)).packs.filter((pack) => pack.id !== packId);
    this.storage.setItem(this.key, JSON.stringify({ schemaVersion: SOURCE_PACK_SCHEMA_VERSION, packs }));
  }
}

export class InMemorySourcePackRepository {
  private raw: string | null = null;
  async load() { return parseSourcePacks(this.raw); }
  async save(pack: SourcePack) {
    const current = parseSourcePacks(this.raw).packs;
    this.raw = JSON.stringify({ schemaVersion: SOURCE_PACK_SCHEMA_VERSION, packs: [pack, ...current.filter((item) => item.id !== pack.id)] });
  }
}
