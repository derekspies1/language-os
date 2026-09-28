export interface UtteranceProgress {
  timesHeard: number;
  timesBridged: number;
  meaningRevealed: number;
  recognizedWithoutHelp: boolean;
}

export type LearnerState = Record<string, UtteranceProgress>;
const key = 'meaning-bridge-progress-v1';

export function loadLearnerState(): LearnerState {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as LearnerState; }
  catch { return {}; }
}

export function saveLearnerState(value: LearnerState): void { localStorage.setItem(key, JSON.stringify(value)); }

export function updateProgress(state: LearnerState, id: string, field: 'timesHeard' | 'timesBridged' | 'meaningRevealed'): LearnerState {
  const previous = state[id] ?? { timesHeard: 0, timesBridged: 0, meaningRevealed: 0, recognizedWithoutHelp: false };
  return { ...state, [id]: { ...previous, [field]: previous[field] + 1 } };
}
