import type { PlaybackController } from './playback';
import type { Utterance } from './transcript';

export type BridgeStage = 'idle' | 'korean_first' | 'pause_after_korean' | 'meaning' | 'pause_after_meaning' | 'korean_return' | 'complete';
export interface BridgeSettings { pauseMs: number; englishVoice: boolean; englishText: boolean; }
export interface BridgeCallbacks { onStage(stage: BridgeStage): void; onKoreanHeard(): void; onMeaningShown(): void; onComplete(): void; }

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    const cancel = () => { window.clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function speakEnglish(text: string, signal: AbortSignal): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speech.rate = 0.95;
    const clean = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { window.speechSynthesis.cancel(); clean(); reject(new DOMException('Cancelled', 'AbortError')); };
    speech.onend = () => { clean(); resolve(); };
    speech.onerror = () => { clean(); resolve(); };
    signal.addEventListener('abort', cancel, { once: true });
    window.speechSynthesis.speak(speech);
  });
}

export class BridgeMachine {
  private controller?: AbortController;
  constructor(private playback: PlaybackController, private callbacks: BridgeCallbacks) {}

  cancel() { this.controller?.abort(); this.controller = undefined; this.playback.stop(); this.callbacks.onStage('idle'); }

  async bridge(utterance: Utterance, settings: BridgeSettings): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    try {
      this.callbacks.onStage('korean_first');
      await this.playback.playSegment(utterance, signal);
      this.callbacks.onKoreanHeard();
      this.callbacks.onStage('pause_after_korean');
      await delay(settings.pauseMs, signal);
      this.callbacks.onStage('meaning');
      this.callbacks.onMeaningShown();
      if (settings.englishVoice) await speakEnglish(utterance.english, signal);
      else await delay(Math.max(900, Math.min(2400, utterance.english.length * 45)), signal);
      this.callbacks.onStage('pause_after_meaning');
      await delay(settings.pauseMs, signal);
      this.callbacks.onStage('korean_return');
      await this.playback.playSegment(utterance, signal);
      this.callbacks.onKoreanHeard();
      this.callbacks.onStage('complete');
      this.callbacks.onComplete();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  async korean(utterance: Utterance, onHeard: () => void, loop = false): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    try {
      do {
        this.callbacks.onStage('korean_first');
        await this.playback.playSegment(utterance, controller.signal);
        onHeard();
      } while (loop && !controller.signal.aborted);
      this.callbacks.onStage('complete');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
