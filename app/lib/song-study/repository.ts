import type { KeyValueStorage } from "../learner-memory/repository";
import {
  SONG_STUDY_SCHEMA_VERSION,
  SONG_STUDY_STORAGE_KEY,
  SongProjectSchema,
  SongStudyEnvelopeSchema,
  type SongProject,
} from "./contracts";

export type LoadSongProjectsResult = { projects: SongProject[]; warning: string | null };

export function parseSongProjects(raw: string | null): LoadSongProjectsResult {
  if (!raw) return { projects: [], warning: null };
  try {
    const parsed = SongStudyEnvelopeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { projects: parsed.data.projects, warning: null };
  } catch { /* reported below */ }
  return { projects: [], warning: "Saved Song Study projects could not be validated. The invalid data was left untouched." };
}

function serialize(projects: SongProject[]) {
  return JSON.stringify(SongStudyEnvelopeSchema.parse({ schemaVersion: SONG_STUDY_SCHEMA_VERSION, projects }));
}

export class BrowserSongStudyRepository {
  constructor(private readonly storage: KeyValueStorage, private readonly key = SONG_STUDY_STORAGE_KEY) {}

  async load() { return parseSongProjects(this.storage.getItem(this.key)); }

  async save(project: SongProject) {
    const validated = SongProjectSchema.parse(project);
    const current = parseSongProjects(this.storage.getItem(this.key)).projects;
    this.storage.setItem(this.key, serialize([validated, ...current.filter((item) => item.id !== validated.id)].slice(0, 100)));
  }

  async delete(projectId: string) {
    const projects = parseSongProjects(this.storage.getItem(this.key)).projects.filter((project) => project.id !== projectId);
    this.storage.setItem(this.key, serialize(projects));
  }
}

export class InMemorySongStudyRepository {
  private raw: string | null = null;
  async load() { return parseSongProjects(this.raw); }
  async save(project: SongProject) {
    const current = parseSongProjects(this.raw).projects;
    this.raw = serialize([SongProjectSchema.parse(project), ...current.filter((item) => item.id !== project.id)]);
  }
  async delete(projectId: string) {
    this.raw = serialize(parseSongProjects(this.raw).projects.filter((item) => item.id !== projectId));
  }
}
