import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MediaPlayer, MediaSource } from './components/MediaPlayer';
import { BridgeMachine, BridgeSettings, BridgeStage } from './core/bridgeMachine';
import { LearnerState, loadLearnerState, saveLearnerState, updateProgress } from './core/learnerState';
import { PlaybackController, youtubeIdFromUrl } from './core/playback';
import { formatTime, Utterance } from './core/transcript';
import { JsonFileTranscriptSource, SampleTranscriptSource } from './core/transcriptSources';

const initialSettings: BridgeSettings = { pauseMs: 650, englishVoice: true, englishText: true };
const stageLabels: Record<BridgeStage, string> = {
  idle: 'Ready', korean_first: 'Listening to Korean', pause_after_korean: 'Pause', meaning: 'Understanding meaning',
  pause_after_meaning: 'Returning to Korean', korean_return: 'Korean, again', complete: 'Complete'
};

export function App() {
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [transcriptName, setTranscriptName] = useState('Sample transcript');
  const [selectedId, setSelectedId] = useState('');
  const [activeId, setActiveId] = useState('');
  const [source, setSource] = useState<MediaSource>({ kind: 'demo' });
  const [youtubeInput, setYoutubeInput] = useState('');
  const [controller, setController] = useState<PlaybackController | null>(null);
  const [stage, setStage] = useState<BridgeStage>('idle');
  const [showMeaning, setShowMeaning] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [progress, setProgress] = useState<LearnerState>(loadLearnerState);
  const [error, setError] = useState('');
  const [isLooping, setIsLooping] = useState(false);
  const machineRef = useRef<BridgeMachine | null>(null);
  const actionIdRef = useRef('');
  const englishTextRef = useRef(settings.englishText);
  const currentFileUrl = useRef<string | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { new SampleTranscriptSource().load().then(rows => { setTranscript(rows); setSelectedId(rows[0].id); }); }, []);
  useEffect(() => { saveLearnerState(progress); }, [progress]);

  const selected = useMemo(() => transcript.find(row => row.id === selectedId) ?? transcript[0], [transcript, selectedId]);
  const selectedIndex = transcript.findIndex(row => row.id === selected?.id);
  englishTextRef.current = settings.englishText;

  const onReady = useCallback((value: PlaybackController | null) => { setController(value); }, []);
  const onError = useCallback((message: string) => { setError(message); }, []);

  useEffect(() => {
    machineRef.current?.cancel();
    if (!controller) { machineRef.current = null; return; }
    const machine = new BridgeMachine(controller, {
      onStage: next => { setStage(next); if (next === 'pause_after_meaning' || next === 'korean_return' || next === 'idle') setShowMeaning(false); },
      onKoreanHeard: () => setProgress(old => updateProgress(old, actionIdRef.current, 'timesHeard')),
      onMeaningShown: () => { if (englishTextRef.current) setShowMeaning(true); setProgress(old => updateProgress(old, actionIdRef.current, 'meaningRevealed')); },
      onComplete: () => setProgress(old => updateProgress(old, actionIdRef.current, 'timesBridged'))
    });
    machineRef.current = machine;
    return () => { machine.cancel(); if (machineRef.current === machine) machineRef.current = null; };
  }, [controller]);

  useEffect(() => {
    if (!controller || source.kind === 'demo') return;
    const timer = window.setInterval(() => {
      const time = controller.getTime();
      const row = transcript.find(item => time >= item.start && time < item.end);
      setActiveId(row?.id ?? '');
    }, 150);
    return () => window.clearInterval(timer);
  }, [controller, source.kind, transcript]);

  useEffect(() => { selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selectedId]);
  useEffect(() => () => { if (currentFileUrl.current) URL.revokeObjectURL(currentFileUrl.current); }, []);

  function select(row: Utterance) {
    setSelectedId(row.id);
    setActiveId(row.id);
    setShowMeaning(false);
    setIsLooping(false);
    setError('');
    if (!machineRef.current) return;
    actionIdRef.current = row.id;
    machineRef.current.korean(row, () => setProgress(old => updateProgress(old, row.id, 'timesHeard'))).catch(handlePlaybackError);
  }

  function handlePlaybackError(reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)); setIsLooping(false); }

  function playKorean(loop = false) {
    if (!selected || !machineRef.current) return;
    actionIdRef.current = selected.id;
    setShowMeaning(false); setIsLooping(loop); setActiveId(selected.id); setError('');
    machineRef.current.korean(selected, () => setProgress(old => updateProgress(old, selected.id, 'timesHeard')), loop).catch(handlePlaybackError);
  }

  function bridge() {
    if (!selected || !machineRef.current) return;
    actionIdRef.current = selected.id;
    setIsLooping(false); setShowMeaning(false); setActiveId(selected.id); setError('');
    machineRef.current.bridge(selected, settings).catch(handlePlaybackError);
  }

  function stop() { machineRef.current?.cancel(); setIsLooping(false); setShowMeaning(false); }

  function meaning() {
    if (!selected) return;
    stop(); setShowMeaning(true); setStage('meaning');
    setProgress(old => updateProgress(old, selected.id, 'meaningRevealed'));
  }

  function changeSource(next: MediaSource) {
    stop(); setError(''); setSource(next);
    if (currentFileUrl.current && (next.kind !== 'local' || next.url !== currentFileUrl.current)) {
      URL.revokeObjectURL(currentFileUrl.current); currentFileUrl.current = null;
    }
  }

  async function loadTranscript(file: File) {
    try {
      const rows = await new JsonFileTranscriptSource(file).load();
      stop(); setTranscript(rows); setTranscriptName(file.name); setSelectedId(rows[0].id); setActiveId(''); setError('');
    } catch (reason) { handlePlaybackError(reason); }
  }

  const stats = selected ? progress[selected.id] : undefined;
  const ready = Boolean(controller && selected);

  return <div className="app-shell">
    <header className="app-header"><div><span className="brand-mark">◉</span><span className="brand">Meaning Bridge</span><span className="version">LOCAL PROTOTYPE</span></div><div className="header-loop">KOREAN <span>→</span> MEANING <span>→</span> KOREAN</div></header>
    <main className="layout">
      <section className="main-column">
        <div className="media-wrap"><MediaPlayer source={source} activeKorean={selected?.korean ?? ''} onReady={onReady} onError={onError} /></div>
        <div className="media-toolbar">
          <span className="eyebrow">SOURCE</span>
          <button className={source.kind === 'demo' ? 'chip active' : 'chip'} onClick={() => changeSource({ kind: 'demo' })}>Sample voice</button>
          <label className="chip file-chip">Local video<input type="file" accept="video/*" onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            if (currentFileUrl.current) URL.revokeObjectURL(currentFileUrl.current);
            const url = URL.createObjectURL(file); currentFileUrl.current = url; changeSource({ kind: 'local', url, name: file.name }); event.target.value = '';
          }} /></label>
          <form className="youtube-form" onSubmit={event => { event.preventDefault(); const id = youtubeIdFromUrl(youtubeInput); if (!id) { setError('Enter a valid YouTube video URL.'); return; } changeSource({ kind: 'youtube', id }); }}>
            <input aria-label="YouTube URL" placeholder="Paste YouTube URL" value={youtubeInput} onChange={event => setYoutubeInput(event.target.value)} />
            <button type="submit">Load</button>
          </form>
        </div>
        <div className="media-caption">{source.kind === 'demo' ? 'Built-in sample • browser Korean voice' : source.kind === 'local' ? source.name : 'YouTube video'} <span>·</span> {transcriptName}</div>
        {error && <div className="error" role="alert">{error}</div>}
        <section className="focus-card">
          <div className="focus-top"><span className="eyebrow">CURRENT UTTERANCE {selectedIndex >= 0 ? `${selectedIndex + 1} / ${transcript.length}` : ''}</span><span className="time">{selected ? `${formatTime(selected.start)}–${formatTime(selected.end)}` : ''}</span></div>
          <div className="focus-korean" lang="ko">{selected?.korean ?? 'Loading transcript…'}</div>
          <div className={showMeaning ? 'meaning visible' : 'meaning'}>{showMeaning ? selected?.english : 'Meaning appears here during Bridge'}</div>
          <div className="stage"><span className={stage === 'idle' || stage === 'complete' ? 'stage-dot' : 'stage-dot running'} />{stageLabels[stage]}</div>
          <button className="bridge-button" disabled={!ready} onClick={bridge}><span>↔</span> BRIDGE <small>Hear Korean · understand · hear again</small></button>
          <div className="controls">
            <button disabled={selectedIndex <= 0} onClick={() => select(transcript[selectedIndex - 1])} aria-label="Previous utterance">← Prev</button>
            <button disabled={!ready} onClick={() => playKorean()}>▶ Korean</button>
            <button disabled={!selected} onClick={meaning}>◉ Meaning</button>
            <button disabled={!ready} className={isLooping ? 'selected-control' : ''} onClick={() => isLooping ? stop() : playKorean(true)}>{isLooping ? '■ Stop loop' : '⟳ Loop'}</button>
            <button onClick={stop}>■ Stop</button>
            <button disabled={selectedIndex < 0 || selectedIndex >= transcript.length - 1} onClick={() => select(transcript[selectedIndex + 1])}>Next →</button>
          </div>
          <div className="stats">Heard {stats?.timesHeard ?? 0} <span>·</span> Bridged {stats?.timesBridged ?? 0} <span>·</span> Meaning opened {stats?.meaningRevealed ?? 0}</div>
        </section>
        <details className="settings"><summary>Bridge settings</summary><div className="settings-row"><label>Pause between stages <select value={settings.pauseMs} onChange={event => setSettings(old => ({ ...old, pauseMs: Number(event.target.value) }))}><option value={300}>Short · 0.3 s</option><option value={650}>Default · 0.65 s</option><option value={1200}>Long · 1.2 s</option><option value={2000}>Extra long · 2 s</option></select></label><label className="check"><input type="checkbox" checked={settings.englishVoice} onChange={event => setSettings(old => ({ ...old, englishVoice: event.target.checked }))} /> Speak English</label><label className="check"><input type="checkbox" checked={settings.englishText} onChange={event => setSettings(old => ({ ...old, englishText: event.target.checked }))} /> Show English</label></div></details>
      </section>
      <aside className="transcript-panel"><div className="transcript-head"><div><div className="eyebrow">FOLLOW ALONG</div><h2>Transcript</h2></div><span>{transcript.length} lines</span></div><div className="transcript-tools"><label className="upload">↑ Load JSON transcript<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) loadTranscript(file); event.target.value = ''; }} /></label><button onClick={async () => { const rows = await new SampleTranscriptSource().load(); stop(); setTranscript(rows); setTranscriptName('Sample transcript'); setSelectedId(rows[0].id); }}>Reset sample</button></div><div className="transcript-list">{transcript.map((row, index) => <button key={row.id} ref={row.id === selectedId ? selectedRowRef : undefined} className={`transcript-row ${row.id === selectedId ? 'selected' : ''} ${row.id === activeId ? 'playing' : ''}`} onClick={() => select(row)}><span className="row-index">{String(index + 1).padStart(2, '0')}</span><span className="row-content"><span className="row-korean" lang="ko">{row.korean}</span><span className="row-english">{settings.englishText && (showMeaning && row.id === selectedId ? row.english : 'Tap Meaning to reveal')}</span></span><span className="row-time">{formatTime(row.start)}</span></button>)}</div><div className="transcript-foot">Select a line to hear its Korean segment.</div></aside>
    </main>
  </div>;
}
