import sample from '../data/sample-transcript.json';
import { TranscriptSource, Utterance, validateTranscript } from './transcript';

export class SampleTranscriptSource implements TranscriptSource {
  async load(): Promise<Utterance[]> { return validateTranscript(sample); }
}

export class JsonFileTranscriptSource implements TranscriptSource {
  constructor(private file: File) {}
  async load(): Promise<Utterance[]> { return validateTranscript(JSON.parse(await this.file.text())); }
}
