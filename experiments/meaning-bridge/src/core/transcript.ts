export interface Utterance {
  id: string;
  start: number;
  end: number;
  korean: string;
  english: string;
}

export interface TranscriptSource {
  load(): Promise<Utterance[]>;
}

export function validateTranscript(value: unknown): Utterance[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Transcript must be a nonempty JSON array.');
  const rows = value.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`Line ${index + 1} is not an object.`);
    const row = raw as Record<string, unknown>;
    if (typeof row.start !== 'number' || !Number.isFinite(row.start) || row.start < 0 ||
        typeof row.end !== 'number' || !Number.isFinite(row.end) || row.end <= row.start ||
        typeof row.korean !== 'string' || !row.korean.trim() ||
        typeof row.english !== 'string') {
      throw new Error(`Line ${index + 1} needs valid start, end, korean, and english fields.`);
    }
    return { id: String(row.id ?? `u${index + 1}`), start: row.start, end: row.end, korean: row.korean, english: row.english };
  });
  rows.sort((a, b) => a.start - b.start);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Transcript IDs must be unique.');
  return rows;
}

export function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
