import { useEffect, useRef } from 'react';
import { DemoSpeechPlayback, LocalVideoPlayback, PlaybackController, YouTubePlayback } from '../core/playback';

export type MediaSource = { kind: 'demo' } | { kind: 'local'; url: string; name: string } | { kind: 'youtube'; id: string };

interface Props {
  source: MediaSource;
  activeKorean: string;
  onReady: (controller: PlaybackController | null) => void;
  onError: (message: string) => void;
}

export function MediaPlayer({ source, activeKorean, onReady, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: PlaybackController | undefined;
    onReady(null);
    if (source.kind === 'demo') {
      controller = new DemoSpeechPlayback();
      onReady(controller);
    } else if (source.kind === 'local' && videoRef.current) {
      controller = new LocalVideoPlayback(videoRef.current);
      onReady(controller);
    } else if (source.kind === 'youtube' && youtubeRef.current) {
      YouTubePlayback.create(youtubeRef.current, source.id).then(created => {
        if (cancelled) created.dispose();
        else { controller = created; onReady(created); }
      }).catch(error => { if (!cancelled) onError(error instanceof Error ? error.message : String(error)); });
    }
    return () => { cancelled = true; controller?.dispose(); onReady(null); };
  }, [source, onReady, onError]);

  if (source.kind === 'local') return <video ref={videoRef} src={source.url} controls playsInline className="video" onError={() => onError('This local video could not be played by the browser.')} />;
  if (source.kind === 'youtube') return <div ref={youtubeRef} className="video youtube" aria-label="YouTube video player" />;
  return <div className="demo-player">
    <div className="demo-icon">한</div>
    <div className="demo-title">Sample conversation</div>
    <div className="demo-line" lang="ko">{activeKorean}</div>
    <div className="demo-note">Korean is spoken with your browser's voice. Add a local video or YouTube URL when you have matching timestamps.</div>
  </div>;
}
