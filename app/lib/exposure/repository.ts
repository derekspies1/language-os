import {
  EXPOSURE_SCHEMA_VERSION,
  EXPOSURE_STORAGE_KEY,
  ExposureSessionEnvelopeSchema,
  ExposureSessionSchema,
  type ExposureSession,
  type ExposureSessionEnvelope,
} from "./contracts";
import type { KeyValueStorage } from "../learner-memory/repository";

export interface ExposureRepository {
  load(): Promise<{ sessions: ExposureSession[]; warning: string | null }>;
  save(session: ExposureSession): Promise<void>;
}

function emptyEnvelope(): ExposureSessionEnvelope {
  return { schemaVersion: EXPOSURE_SCHEMA_VERSION, sessions: [] };
}

export function parseExposureSessions(raw: string | null): { sessions: ExposureSession[]; warning: string | null } {
  if (!raw) return { sessions: [], warning: null };
  try {
    const parsed = ExposureSessionEnvelopeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { sessions: parsed.data.sessions, warning: null };
  } catch { /* handled below */ }
  return { sessions: [], warning: "Saved daily exposure sessions could not be validated. Learner memory was not changed." };
}

export class BrowserExposureRepository implements ExposureRepository {
  constructor(private readonly storage: KeyValueStorage, private readonly key = EXPOSURE_STORAGE_KEY) {}

  async load() { return parseExposureSessions(this.storage.getItem(this.key)); }

  async save(session: ExposureSession) {
    const parsed = ExposureSessionSchema.parse(session);
    const current = parseExposureSessions(this.storage.getItem(this.key)).sessions;
    const next = [parsed, ...current.filter((candidate) => candidate.id !== parsed.id)].slice(0, 180);
    this.storage.setItem(this.key, JSON.stringify(ExposureSessionEnvelopeSchema.parse({ ...emptyEnvelope(), sessions: next })));
  }
}

export class InMemoryExposureRepository implements ExposureRepository {
  private raw: string | null = null;
  async load() { return parseExposureSessions(this.raw); }
  async save(session: ExposureSession) {
    const current = parseExposureSessions(this.raw).sessions;
    this.raw = JSON.stringify({ schemaVersion: EXPOSURE_SCHEMA_VERSION, sessions: [session, ...current.filter((item) => item.id !== session.id)] });
  }
}
