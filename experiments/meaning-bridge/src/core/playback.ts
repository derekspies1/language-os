import type { Utterance } from './transcript';

export interface PlaybackController {
  playSegment(utterance: Utterance, signal: AbortSignal): Promise<void>;
  stop(): void;
  getTime(): number;
  subscribeTime(listener: (seconds: number) => void): () => void;
  dispose(): void;
}

type TimeListener = (seconds: number) => void;

abstract class TimedPlayback implements PlaybackController {
  protected listeners = new Set<TimeListener>();
  protected timer: number | undefined;
  protected finish: (() => void) | undefined;
  abstract getTime(): number;
  abstract stopMedia(): void;
  abstract seek(seconds: number): void;
  abstract startMedia(): Promise<void>;

  async playSegment(utterance: Utterance, signal: AbortSignal): Promise<void> {
    this.stop();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    this.seek(utterance.start);
    return new Promise<void>((resolve, reject) => {
      const done = () => { this.clearTimer(); signal.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => { this.stopMedia(); this.clearTimer(); reject(new DOMException('Cancelled', 'AbortError')); };
      this.finish = done;
      signal.addEventListener('abort', cancel, { once: true });
      this.startMedia().then(() => {
        if (signal.aborted) return;
        this.timer = window.setInterval(() => {
          const time = this.getTime();
          this.listeners.forEach(listener => listener(time));
          if (time >= utterance.end - 0.035) { this.stopMedia(); done(); }
        }, 35);
      }).catch(error => { this.clearTimer(); signal.removeEventListener('abort', cancel); reject(error); });
    });
  }

  private clearTimer() { if (this.timer !== undefined) window.clearInterval(this.timer); this.timer = undefined; this.finish = undefined; }
  stop() { this.stopMedia(); this.finish?.(); this.clearTimer(); }
  subscribeTime(listener: TimeListener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  dispose() { this.stop(); this.listeners.clear(); }
}

export class LocalVideoPlayback extends TimedPlayback {
  constructor(private video: HTMLVideoElement) { super(); }
  getTime() { return this.video.currentTime; }
  stopMedia() { this.video.pause(); }
  seek(seconds: number) { this.video.currentTime = seconds; }
  async startMedia() { await this.video.play(); }
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YTConstructor { new (element: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: () => void; onError: (event: { data: number }) => void } }): YTPlayer; }
declare global { interface Window { YT?: { Player: YTConstructor }; onYouTubeIframeAPIReady?: () => void; } }

let youtubeApi: Promise<void> | undefined;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApi) youtubeApi = new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => reject(new Error('Could not load the YouTube player API.'));
    document.head.append(script);
  });
  return youtubeApi;
}

export function youtubeIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0] :
      host === 'youtube.com' || host === 'm.youtube.com' ?
        url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : url.searchParams.get('v') : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export class YouTubePlayback extends TimedPlayback {
  private constructor(private player: YTPlayer) { super(); }
  static async create(element: HTMLElement, id: string): Promise<YouTubePlayback> {
    await loadYouTubeApi();
    return new Promise((resolve, reject) => {
      const player = new window.YT!.Player(element, {
        videoId: id,
        playerVars: { controls: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => resolve(new YouTubePlayback(player)),
          onError: event => reject(new Error(`YouTube could not play this video (code ${event.data}).`))
        }
      });
    });
  }
  getTime() { return this.player.getCurrentTime() || 0; }
  stopMedia() { this.player.pauseVideo(); }
  seek(seconds: number) { this.player.seekTo(seconds, true); }
  async startMedia() { this.player.playVideo(); }
  dispose() { super.dispose(); this.player.destroy(); }
}

export class DemoSpeechPlayback implements PlaybackController {
  private listeners = new Set<TimeListener>();
  private finish?: () => void;
  private timer?: number;
  private currentTime = 0;
  getTime() { return this.currentTime; }
  async playSegment(utterance: Utterance, signal: AbortSignal): Promise<void> {
    this.stop();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    this.currentTime = utterance.start;
    this.listeners.forEach(listener => listener(this.currentTime));
    return new Promise<void>((resolve, reject) => {
      const done = () => { signal.removeEventListener('abort', cancel); this.finish = undefined; resolve(); };
      const cancel = () => { window.speechSynthesis?.cancel(); if (this.timer !== undefined) window.clearTimeout(this.timer); this.finish = undefined; signal.removeEventListener('abort', cancel); reject(new DOMException('Cancelled', 'AbortError')); };
      this.finish = done;
      signal.addEventListener('abort', cancel, { once: true });
      if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(utterance.korean);
        speech.lang = 'ko-KR';
        speech.rate = 0.88;
        speech.onend = done;
        speech.onerror = () => { this.timer = window.setTimeout(done, 500); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(speech);
      } else {
        this.timer = globalThis.setTimeout(done, (utterance.end - utterance.start) * 1000);
      }
    });
  }
  stop() { window.speechSynthesis?.cancel(); if (this.timer !== undefined) window.clearTimeout(this.timer); this.finish?.(); this.finish = undefined; }
  subscribeTime(listener: TimeListener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  dispose() { this.stop(); this.listeners.clear(); }
}
