import type { PronunciationRequest, PronunciationService } from "../contracts";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL = "eleven_multilingual_v2";
const MAX_CACHE_ENTRIES = 100;

type CachedAudio = { bytes: Uint8Array; contentType: string };
const audioCache = new Map<string, CachedAudio>();

export class ElevenLabsPronunciationService implements PronunciationService {
  readonly provider = "elevenlabs" as const;

  constructor(
    private readonly apiKey: string,
    private readonly voiceId = DEFAULT_VOICE_ID,
    readonly model = DEFAULT_MODEL,
    private readonly request: typeof fetch = fetch,
  ) {}

  async synthesize(input: PronunciationRequest, signal?: AbortSignal) {
    const cacheKey = `${this.voiceId}\u0000${this.model}\u0000${input.text}`;
    const cached = audioCache.get(cacheKey);
    if (cached) return { ...cached, bytes: cached.bytes.slice(), cacheHit: true };

    const response = await this.request(
      `${ELEVENLABS_TTS_URL}/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({ text: input.text, model_id: this.model }),
        signal,
      },
    );
    if (!response.ok) throw new Error(`ElevenLabs pronunciation request failed with status ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("ElevenLabs returned empty pronunciation audio.");
    const contentType = response.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
    audioCache.set(cacheKey, { bytes, contentType });
    if (audioCache.size > MAX_CACHE_ENTRIES) audioCache.delete(audioCache.keys().next().value!);
    return { bytes: bytes.slice(), contentType, cacheHit: false };
  }
}

export function resolvePronunciationService(env: NodeJS.ProcessEnv = process.env): PronunciationService | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  return new ElevenLabsPronunciationService(
    apiKey,
    env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL,
  );
}
