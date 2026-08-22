"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  addChallengeEvent,
  createSongCue,
  createSongProject,
  cueAtTime,
  cueDisplayText,
  cueLayerValue,
  SongProjectSchema,
  upsertCueLayer,
  type ChallengeMode,
  type CueLayerKind,
  type MediaReference,
  type SongCue,
  type SongProject,
} from "../../lib/song-study/contracts";
import { BrowserSongStudyRepository } from "../../lib/song-study/repository";

type Screen = "library" | "new" | "studio";
type OverlayMode = "personal" | "target" | "meaning" | "minimal" | "challenge";

const LAYER_FIELDS: Array<{ kind: CueLayerKind; label: string; placeholder: string; area?: boolean }> = [
  { kind: "target_text", label: "Korean / target text", placeholder: "What the phrase actually is" },
  { kind: "natural_meaning", label: "Natural meaning", placeholder: "What it means naturally" },
  { kind: "literal_meaning", label: "Literal meaning", placeholder: "A closer word-for-word reading" },
  { kind: "breakdown", label: "Phrase breakdown", placeholder: "Split the phrase in your own useful way", area: true },
  { kind: "vocabulary", label: "Vocabulary", placeholder: "Words worth keeping", area: true },
  { kind: "grammar", label: "Grammar / patterns", placeholder: "-다고 = quoted statement", area: true },
  { kind: "pronunciation", label: "Listening notes", placeholder: "Reductions, boundaries, sounds you missed", area: true },
  { kind: "mnemonic", label: "Personal mnemonic", placeholder: "A memory hook only you need", area: true },
  { kind: "question", label: "Uncertainty / questions", placeholder: "What still does not make sense?", area: true },
  { kind: "note", label: "Free note", placeholder: "Anything else you noticed", area: true },
];

function fileReference(file: File, duration: number | null = null): MediaReference {
  return {
    kind: file.type.startsWith("video/") ? "video" : "audio",
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    lastModified: file.lastModified,
    duration,
  };
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00.0";
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(value));
}

export function SongStudyStudio() {
  const repositoryRef = useRef<BrowserSongStudyRepository | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<SongProject[]>([]);
  const [screen, setScreen] = useState<Screen>("library");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const active = projects.find((project) => project.id === activeId) ?? null;

  useEffect(() => {
    const repository = new BrowserSongStudyRepository(window.localStorage);
    repositoryRef.current = repository;
    void repository.load().then((result) => {
      setProjects(result.projects);
      setWarning(result.warning);
      setHydrated(true);
    }).catch(() => {
      setHydrated(true);
      setWarning("Song Study storage could not be opened. You can still work, but changes may not survive a refresh.");
    });
    return () => { if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current); };
  }, []);

  const attachMedia = useCallback((projectId: string, file: File) => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    const url = URL.createObjectURL(file);
    mediaUrlRef.current = url;
    setMediaUrl(url);
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      const next = SongProjectSchema.parse({ ...project, media: fileReference(file, project.media.duration), updatedAt: new Date().toISOString() });
      void repositoryRef.current?.save(next);
      return next;
    }));
  }, []);

  const updateProject = useCallback((projectId: string, update: (project: SongProject) => SongProject) => {
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      const now = new Date().toISOString();
      const next = SongProjectSchema.parse({ ...update(project), updatedAt: now, lastStudiedAt: now });
      void repositoryRef.current?.save(next).catch(() => setWarning("The latest change could not be saved in this browser."));
      return next;
    }));
  }, []);

  function openProject(id: string) {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = null;
    setMediaUrl(null);
    setActiveId(id);
    setScreen("studio");
  }

  function createProject(values: { title: string; artist: string; file: File }) {
    const project = createSongProject({ title: values.title, artist: values.artist, media: fileReference(values.file) });
    setProjects((current) => [project, ...current]);
    void repositoryRef.current?.save(project);
    setActiveId(project.id);
    attachMedia(project.id, values.file);
    setScreen("studio");
  }

  async function deleteProject(id: string) {
    setProjects((current) => current.filter((project) => project.id !== id));
    await repositoryRef.current?.delete(id);
  }

  return <main className={`song-study song-study-${screen}`}>
    <header className="song-topbar">
      <button className="song-brand" type="button" onClick={() => setScreen("library")}><span>L/</span><div><b>LANGUAGE OS</b><small>SONG STUDY</small></div></button>
      <nav aria-label="Product navigation"><Link href="/repeat">Repeat Studio</Link><Link href="/exposure">Daily exposure</Link><Link href="/learn">Learning universe</Link><Link href="/">Expression coach</Link><i /> <span>LOCAL · LEARNER-BUILT</span></nav>
    </header>
    {warning && <div className="song-warning" role="status"><span>{warning}</span><button type="button" onClick={() => setWarning(null)}>Dismiss</button></div>}
    {!hydrated ? <div className="song-loading"><i /><p>Opening your listening room…</p></div> : screen === "library" ? (
      <SongLibrary projects={projects} onNew={() => setScreen("new")} onOpen={openProject} onDelete={(id) => void deleteProject(id)} />
    ) : screen === "new" ? (
      <NewSong onCancel={() => setScreen("library")} onCreate={createProject} />
    ) : active ? (
      <SongWorkbench project={active} mediaUrl={mediaUrl} onAttach={(file) => attachMedia(active.id, file)} onHome={() => setScreen("library")} updateProject={(update) => updateProject(active.id, update)} />
    ) : <div className="song-missing"><h1>That song project is no longer here.</h1><button type="button" onClick={() => setScreen("library")}>Back to Song Study</button></div>}
  </main>;
}

function SongLibrary({ projects, onNew, onOpen, onDelete }: { projects: SongProject[]; onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return <div className="song-library">
    <section className="song-library-hero">
      <div><p className="song-kicker">노래를 직접 해독해요</p><h1>Build understanding<br /><em>into the song.</em></h1><p>Start with your ears and an empty timeline. Loop what catches you, save what you think, and let your own map grow with every listen.</p><button className="song-primary" type="button" onClick={onNew}>New song <span>＋</span></button></div>
      <aside><span>THE WORK IS THE LEARNING</span><p>The player handles timing, replay, and storage. You do the noticing, reconstruction, and interpretation.</p><div><b>01</b> ISOLATE <b>02</b> ATTEMPT <b>03</b> BUILD <b>04</b> RECALL</div></aside>
    </section>
    <section className="song-projects">
      <header><div><p>YOUR ARCHIVE</p><h2>Songs under investigation</h2></div><span>{projects.length} local {projects.length === 1 ? "project" : "projects"}</span></header>
      {projects.length === 0 ? <div className="song-empty"><div className="empty-orbit"><i /><i /><i /></div><h3>The timeline is empty.</h3><p>Bring a song you already cannot stop playing.</p><button type="button" onClick={onNew}>Choose your first song</button></div> : <div className="song-card-grid">{projects.map((project, index) => {
        const duration = project.media.duration ?? 0;
        return <article className="song-card" key={project.id} style={{ "--card-index": index } as React.CSSProperties}>
          <button className="song-card-open" type="button" onClick={() => onOpen(project.id)}>
            <div className="song-card-art"><span>{String(index + 1).padStart(2, "0")}</span>{Array.from({ length: 13 }, (_, bar) => <i key={bar} style={{ height: `${22 + ((bar * 17 + index * 11) % 62)}%` }} />)}</div>
            <p>{project.artist || "Unknown artist"}</p><h3>{project.title}</h3>
            <div className="song-mini-map">{project.cues.slice(0, 40).map((cue) => <i key={cue.id} data-status={cue.status} style={{ left: `${duration ? Math.min(100, cue.timing.start / duration * 100) : Math.min(96, project.cues.indexOf(cue) * 5)}%` }} />)}</div>
            <footer><span>{project.cues.length} mapped {project.cues.length === 1 ? "fragment" : "fragments"}</span><span>Studied {formatDate(project.lastStudiedAt)}</span></footer>
          </button>
          <button className="song-card-delete" type="button" aria-label={`Delete ${project.title}`} onClick={() => { if (window.confirm(`Delete “${project.title}” and its ${project.cues.length} cues from this browser?`)) onDelete(project.id); }}>×</button>
        </article>;
      })}</div>}
    </section>
  </div>;
}

function NewSong({ onCancel, onCreate }: { onCancel: () => void; onCreate: (values: { title: string; artist: string; file: File }) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim() && file) onCreate({ title, artist, file }); }
  return <div className="new-song-page">
    <button className="song-back" type="button" onClick={onCancel}>← Your song archive</button>
    <div className="new-song-grid"><section><p className="song-kicker">NEW INVESTIGATION</p><h1>One song.<br />Nothing filled in.</h1><p>Choose a local file you own or are allowed to use. Language OS stores only its identifying metadata—never the media bytes—so you will reattach the file when you return.</p><div className="productive-card"><span>PRODUCTIVE DIFFICULTY</span><p>No lyrics will be fetched and no whole-song solution appears. Begin with what you can hear.</p></div></section>
      <form onSubmit={submit} className="new-song-form">
        <label>Song title<input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The song you keep replaying" /></label>
        <label>Artist <small>optional</small><input maxLength={160} value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist" /></label>
        <label className={`media-drop ${file ? "has-file" : ""}`}><input type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.mp4,.webm,.mov" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span>{file ? "MEDIA READY" : "LOCAL MEDIA"}</span><b>{file ? file.name : "Choose audio or video"}</b><p>{file ? `${(file.size / 1_000_000).toFixed(1)} MB · ${file.type || "media file"}` : "MP3, M4A, WAV, AAC, OGG, FLAC, MP4, WebM, or MOV"}</p></label>
        <button className="song-primary" type="submit" disabled={!title.trim() || !file}>Open the studio <span>→</span></button>
      </form>
    </div>
  </div>;
}

function SongWorkbench({ project, mediaUrl, onAttach, onHome, updateProject }: { project: SongProject; mediaUrl: string | null; onAttach: (file: File) => void; onHome: () => void; updateProject: (update: (project: SongProject) => SongProject) => void }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(project.playback.position);
  const [duration, setDuration] = useState(project.media.duration ?? 0);
  const [volume, setVolume] = useState(project.playback.volume);
  const [rate, setRate] = useState(project.playback.rate);
  const [loopStart, setLoopStart] = useState<number | null>(project.playback.loopStart);
  const [loopEnd, setLoopEnd] = useState<number | null>(project.playback.loopEnd);
  const [loopEnabled, setLoopEnabled] = useState(project.playback.loopEnabled);
  const [quickDraft, setQuickDraft] = useState("");
  const [selectedCueId, setSelectedCueId] = useState<string | null>(project.cues[0]?.id ?? null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("personal");
  const activeCue = cueAtTime(project.cues, currentTime);
  const selectedCue = project.cues.find((cue) => cue.id === selectedCueId) ?? null;

  const commitPlayback = useCallback((position = currentTime) => {
    updateProject((current) => ({ ...current, playback: { position, volume, rate, loopEnabled, loopStart, loopEnd } }));
  }, [currentTime, loopEnabled, loopEnd, loopStart, rate, updateProject, volume]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !mediaUrl) return;
    media.volume = volume;
    media.playbackRate = rate;
  }, [mediaUrl, rate, volume]);

  useEffect(() => {
    function keys(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable=true]");
      if (typing) return;
      const media = mediaRef.current;
      if (!media) return;
      if (event.code === "Space") { event.preventDefault(); void togglePlay(media); }
      else if (event.key === "[") setLoopStart(Number(media.currentTime.toFixed(2)));
      else if (event.key === "]") { const end = Number(media.currentTime.toFixed(2)); setLoopEnd(end); setLoopEnabled(loopStart !== null && end > loopStart); }
      else if (event.key.toLowerCase() === "l") setLoopEnabled((value) => !value);
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(media.currentTime + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 0.25 : 5)); }
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); navigateCue(event.key === "ArrowUp" ? -1 : 1); }
      else if (event.key.toLowerCase() === "r") replaySelected();
      else if (event.key.toLowerCase() === "a") quickInputRef.current?.focus();
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  async function togglePlay(media = mediaRef.current) {
    if (!media) return;
    if (media.paused) await media.play(); else media.pause();
  }

  function seek(time: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Math.max(0, Math.min(duration || Infinity, time));
    setCurrentTime(media.currentTime);
  }

  function onTimeUpdate() {
    const media = mediaRef.current;
    if (!media) return;
    if (loopEnabled && loopStart !== null && loopEnd !== null && media.currentTime >= loopEnd - 0.035) {
      media.currentTime = loopStart;
      if (media.paused) void media.play();
    }
    setCurrentTime(media.currentTime);
  }

  function loaded() {
    const media = mediaRef.current;
    if (!media) return;
    const nextDuration = Number.isFinite(media.duration) ? media.duration : 0;
    setDuration(nextDuration);
    media.currentTime = Math.min(project.playback.position, nextDuration || project.playback.position);
    updateProject((current) => ({ ...current, media: { ...current.media, duration: nextDuration || null } }));
  }

  function saveQuickCue() {
    if (!quickDraft.trim()) return;
    const useLoop = loopStart !== null && loopEnd !== null && loopEnd > loopStart && (loopEnabled || currentTime >= loopStart && currentTime <= loopEnd);
    const cue = createSongCue({ timing: useLoop ? { start: loopStart, end: loopEnd } : { start: Number(currentTime.toFixed(2)), end: null }, attempt: quickDraft });
    updateProject((current) => ({ ...current, cues: [...current.cues, cue].sort((a, b) => a.timing.start - b.timing.start) }));
    setSelectedCueId(cue.id);
    setQuickDraft("");
  }

  function createCue(event: FormEvent) {
    event.preventDefault();
    saveQuickCue();
  }

  function navigateCue(direction: number) {
    if (!project.cues.length) return;
    const sorted = [...project.cues].sort((a, b) => a.timing.start - b.timing.start);
    const anchor = selectedCueId ? sorted.findIndex((cue) => cue.id === selectedCueId) : sorted.findIndex((cue) => cue.timing.start > currentTime);
    const index = anchor < 0 ? 0 : (anchor + direction + sorted.length) % sorted.length;
    setSelectedCueId(sorted[index].id);
    seek(sorted[index].timing.start);
  }

  function replaySelected() {
    const cue = selectedCue ?? activeCue;
    if (!cue) return;
    const start = Math.max(0, cue.timing.start - (cue.timing.end === null ? 0.75 : 0));
    const end = cue.timing.end ?? cue.timing.start + 2.5;
    setLoopStart(start); setLoopEnd(end); setLoopEnabled(true); seek(start);
    if (mediaRef.current?.paused) void mediaRef.current.play();
  }

  function updateSelected(next: SongCue) {
    updateProject((current) => ({ ...current, cues: current.cues.map((cue) => cue.id === next.id ? next : cue) }));
  }

  const loopValid = loopStart !== null && loopEnd !== null && loopEnd > loopStart;
  return <div className="song-workbench-shell">
    <div className="studio-subbar"><button type="button" onClick={() => { commitPlayback(); onHome(); }}>← Archive</button><div><strong>{project.title}</strong><span>{project.artist || project.media.fileName}</span></div><div className="studio-mode-tabs" role="group" aria-label="Overlay mode">{(["personal", "target", "meaning", "minimal", "challenge"] as OverlayMode[]).map((mode) => <button key={mode} className={overlayMode === mode ? "active" : ""} type="button" onClick={() => setOverlayMode(mode)}>{mode}</button>)}</div></div>
    <div className="song-studio-grid">
      <section className="player-zone">
        <div className={`immersive-player ${playing ? "is-playing" : ""} ${project.media.kind}`}>
          {mediaUrl ? project.media.kind === "video" ? <video ref={(element) => { mediaRef.current = element; }} src={mediaUrl} onLoadedMetadata={loaded} onTimeUpdate={onTimeUpdate} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); commitPlayback(mediaRef.current?.currentTime ?? currentTime); }} /> : <audio ref={(element) => { mediaRef.current = element; }} src={mediaUrl} onLoadedMetadata={loaded} onTimeUpdate={onTimeUpdate} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); commitPlayback(mediaRef.current?.currentTime ?? currentTime); }} /> : null}
          {!mediaUrl ? <ReattachMedia project={project} onAttach={onAttach} /> : <>
            {project.media.kind === "audio" && <div className="audio-visual"><div className="player-orbit"><i /><i /><i /><span>{playing ? "PLAYING" : "PAUSED"}</span></div><div className="sound-bars">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ "--bar": `${18 + (index * 29 % 78)}%`, "--delay": `${index * -37}ms` } as React.CSSProperties} />)}</div></div>}
            <PlaybackOverlay cue={activeCue} mode={overlayMode} project={project} onChallenge={(mode, response, outcome) => updateProject((current) => addChallengeEvent(current, { cueId: activeCue!.id, mode, response, outcome }))} />
          </>}
          <div className="player-title"><span>{project.artist || "PERSONAL MEDIA"}</span><h1>{project.title}</h1></div>
        </div>

        <div className="transport">
          <div className="transport-main"><button type="button" onClick={() => navigateCue(-1)} aria-label="Previous cue">↤</button><button className="play-button" type="button" disabled={!mediaUrl} onClick={() => void togglePlay()} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button><button type="button" onClick={() => navigateCue(1)} aria-label="Next cue">↦</button><span>{formatTime(currentTime)}</span><b>/</b><span>{formatTime(duration)}</span><div className="transport-spacer" /><label>VOL<input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (mediaRef.current) mediaRef.current.volume = value; }} /></label><select aria-label="Playback speed" value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (mediaRef.current) mediaRef.current.playbackRate = value; }}>{[0.65, 0.8, 1, 1.15, 1.3].map((value) => <option value={value} key={value}>{value}×</option>)}</select></div>
          <Timeline project={project} duration={duration} currentTime={currentTime} loopStart={loopStart} loopEnd={loopEnd} onSeek={seek} onCue={(cue) => { setSelectedCueId(cue.id); seek(cue.timing.start); }} />
          <div className="loop-controls"><span>A/B LOOP</span><button type="button" className={loopStart !== null ? "set" : ""} onClick={() => setLoopStart(Number(currentTime.toFixed(2)))}><kbd>[</kbd> A {loopStart === null ? "SET START" : formatTime(loopStart)}</button><button type="button" className={loopEnd !== null ? "set" : ""} onClick={() => { const end = Number(currentTime.toFixed(2)); setLoopEnd(end); if (loopStart !== null && end > loopStart) setLoopEnabled(true); }}><kbd>]</kbd> B {loopEnd === null ? "SET END" : formatTime(loopEnd)}</button><button type="button" disabled={!loopValid} className={loopEnabled ? "loop-on" : ""} onClick={() => setLoopEnabled((value) => !value)}><kbd>L</kbd> {loopEnabled ? "LOOPING" : "LOOP OFF"}</button><button type="button" onClick={() => { setLoopStart(null); setLoopEnd(null); setLoopEnabled(false); }}>CLEAR</button></div>
        </div>

        <form className="quick-capture" onSubmit={createCue}><div><span>ADD TO SONG</span><p>{loopValid ? `${formatTime(loopStart!)} → ${formatTime(loopEnd!)} · LOOP RANGE` : `${formatTime(currentTime)} · POINT CUE`}</p></div><input ref={quickInputRef} value={quickDraft} onChange={(event) => setQuickDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveQuickCue(); } }} placeholder="Type what you think you hear… incomplete is welcome" maxLength={8_000} /><button type="submit" disabled={!quickDraft.trim()}>SAVE <kbd>↵</kbd></button></form>
      </section>

      <aside className="cue-workbench">
        <header><div><p>YOUR MAP</p><h2>{project.cues.length} {project.cues.length === 1 ? "fragment" : "fragments"}</h2></div><button type="button" onClick={() => quickInputRef.current?.focus()}>＋ Add</button></header>
        <div className="cue-list">{project.cues.length === 0 ? <div className="cue-list-empty"><span>LISTEN FIRST</span><p>Set a loop, type what you hear, and press Enter. Your first marker will appear here.</p></div> : project.cues.map((cue, index) => <button type="button" key={cue.id} className={`${selectedCueId === cue.id ? "selected" : ""} ${activeCue?.id === cue.id ? "playing" : ""}`} onClick={() => { setSelectedCueId(cue.id); seek(cue.timing.start); }}><span>{String(index + 1).padStart(2, "0")}</span><div><b lang="ko">{cueDisplayText(cue)}</b><small>{formatTime(cue.timing.start)}{cue.timing.end === null ? " · POINT" : ` → ${formatTime(cue.timing.end)}`}</small></div><i data-status={cue.status} /></button>)}</div>
        {selectedCue ? <CueEditor key={selectedCue.id} cue={selectedCue} onChange={updateSelected} onReplay={replaySelected} /> : <div className="cue-editor-placeholder"><p>Select a marker to enrich it without stopping the song.</p></div>}
      </aside>
    </div>
    <footer className="shortcut-strip"><span>SPACE PLAY / PAUSE</span><span>[ ] LOOP POINTS</span><span>L TOGGLE LOOP</span><span>A QUICK CAPTURE</span><span>R REPLAY CUE</span><span>↑ ↓ CUES</span><span>⇧ ← → FINE SEEK</span></footer>
  </div>;
}

function ReattachMedia({ project, onAttach }: { project: SongProject; onAttach: (file: File) => void }) {
  return <div className="reattach-media"><div className="missing-disc"><i /></div><span>MEDIA NOT STORED</span><h2>Reconnect “{project.media.fileName}”</h2><p>Your cues and learning history are here. Choose the local file again to resume at {formatTime(project.playback.position)}.</p><label><input type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.mp4,.webm,.mov" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(file); }} />Choose media file</label></div>;
}

function Timeline({ project, duration, currentTime, loopStart, loopEnd, onSeek, onCue }: { project: SongProject; duration: number; currentTime: number; loopStart: number | null; loopEnd: number | null; onSeek: (time: number) => void; onCue: (cue: SongCue) => void }) {
  const max = duration || Math.max(1, ...project.cues.map((cue) => cue.timing.end ?? cue.timing.start + 1));
  return <div className="knowledge-timeline"><div className="timeline-track"><div className="timeline-progress" style={{ width: `${Math.min(100, currentTime / max * 100)}%` }} />{loopStart !== null && loopEnd !== null && loopEnd > loopStart && <div className="timeline-loop" style={{ left: `${loopStart / max * 100}%`, width: `${(loopEnd - loopStart) / max * 100}%` }} />}{project.cues.map((cue) => <button type="button" key={cue.id} data-status={cue.status} aria-label={`Cue at ${formatTime(cue.timing.start)}`} style={{ left: `${Math.min(100, cue.timing.start / max * 100)}%`, width: cue.timing.end === null ? undefined : `${Math.max(.4, (cue.timing.end - cue.timing.start) / max * 100)}%` }} onClick={() => onCue(cue)} />)}<i className="timeline-head" style={{ left: `${Math.min(100, currentTime / max * 100)}%` }} /></div><input aria-label="Song timeline" type="range" min="0" max={max} step="0.01" value={Math.min(currentTime, max)} onChange={(event) => onSeek(Number(event.target.value))} /></div>;
}

function PlaybackOverlay({ cue, mode, project, onChallenge }: { cue: SongCue | null; mode: OverlayMode; project: SongProject; onChallenge: (mode: ChallengeMode, response: string, outcome: "got_it" | "almost" | "missed") => void }) {
  if (!cue) return <div className="playback-overlay dormant"><span>LISTENING</span><p>Your annotations will surface here when the song reaches them.</p></div>;
  if (mode === "challenge") return <ChallengeOverlay key={cue.id} cue={cue} historyCount={project.challengeHistory.filter((event) => event.cueId === cue.id).length} onComplete={onChallenge} />;
  const target = cueLayerValue(cue, "target_text") || cue.attempts[0]?.response;
  const meaning = cueLayerValue(cue, "natural_meaning");
  return <div className={`playback-overlay mode-${mode}`}>
    <span>{mode === "personal" ? "YOUR MAP · FIRST HEARING PRESERVED" : mode.toUpperCase()}</span>
    {mode === "minimal" ? <p className="minimal-cue">◆ {formatTime(cue.timing.start)}</p> : <>
      <h2 lang="ko">{target}</h2>
      {mode === "personal" && cueLayerValue(cue, "target_text") && cue.attempts[0]?.response !== target && <p className="first-attempt">First heard: {cue.attempts[0]?.response}</p>}
      {(mode === "meaning" || mode === "personal") && meaning && <p className="overlay-meaning">{meaning}</p>}
      {mode === "personal" && cueLayerValue(cue, "breakdown") && <p className="overlay-breakdown">{cueLayerValue(cue, "breakdown")}</p>}
    </>}
  </div>;
}

function ChallengeOverlay({ cue, historyCount, onComplete }: { cue: SongCue; historyCount: number; onComplete: (mode: ChallengeMode, response: string, outcome: "got_it" | "almost" | "missed") => void }) {
  const target = cueLayerValue(cue, "target_text") || cue.attempts[0]?.response || "";
  const meaning = cueLayerValue(cue, "natural_meaning");
  const defaultMode: ChallengeMode = meaning ? "audio_to_target" : "audio_to_target";
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>(defaultMode);
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const prompt = challengeMode === "target_to_meaning" ? target : challengeMode === "meaning_to_target" ? meaning : "Listen. Reconstruct the Korean you hear.";
  const answer = challengeMode === "target_to_meaning" ? meaning : target;
  function finish(outcome: "got_it" | "almost" | "missed") {
    onComplete(challengeMode, response, outcome);
    setResponse("");
    setRevealed(false);
  }
  return <div className="playback-overlay challenge-overlay"><div className="challenge-head"><span>CHALLENGE · ATTEMPT {historyCount + 1}</span><select value={challengeMode} onChange={(event) => { setChallengeMode(event.target.value as ChallengeMode); setRevealed(false); }}><option value="audio_to_target">Hear → Korean</option>{meaning && <option value="target_to_meaning">Korean → meaning</option>}{meaning && <option value="meaning_to_target">Meaning → Korean</option>}</select></div><p className="challenge-prompt" lang={challengeMode === "target_to_meaning" ? "ko" : undefined}>{prompt}</p><input value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Commit an attempt before revealing…" onKeyDown={(event) => { if (event.key === "Enter" && response.trim()) setRevealed(true); }} />{!revealed ? <button type="button" disabled={!response.trim()} onClick={() => setRevealed(true)}>Commit & reveal</button> : <div className="challenge-reveal"><span>COMPARE WITH YOUR MAP</span><b lang="ko">{answer || "No answer layer yet—enrich this cue first."}</b><div><button type="button" onClick={() => finish("got_it")}>Got it</button><button type="button" onClick={() => finish("almost")}>Almost</button><button type="button" onClick={() => finish("missed")}>Missed it</button></div></div>}</div>;
}

function CueEditor({ cue, onChange, onReplay }: { cue: SongCue; onChange: (cue: SongCue) => void; onReplay: () => void }) {
  const [fields, setFields] = useState<Record<CueLayerKind, string>>(() => Object.fromEntries(LAYER_FIELDS.map((field) => [field.kind, cueLayerValue(cue, field.kind)])) as Record<CueLayerKind, string>);
  const [status, setStatus] = useState(cue.status);
  const [confidence, setConfidence] = useState(cue.confidence);
  const [difficulty, setDifficulty] = useState(cue.difficulty);
  const [tags, setTags] = useState(cue.tags.join(", "));
  const [start, setStart] = useState(cue.timing.start);
  const [end, setEnd] = useState<number | null>(cue.timing.end);
  const [saved, setSaved] = useState(false);

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (end !== null && end <= start) return;
    let next = { ...cue, timing: { start, end }, status, confidence, difficulty, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) } as SongCue;
    for (const field of LAYER_FIELDS) next = upsertCueLayer(next, { kind: field.kind, value: fields[field.kind] });
    onChange(next);
    setSaved(true); window.setTimeout(() => setSaved(false), 1200);
  }

  return <form className="cue-editor" onSubmit={save}>
    <div className="editor-title"><div><span>FRAGMENT EVIDENCE</span><h3>{formatTime(cue.timing.start)}</h3></div><button type="button" onClick={onReplay}>↻ Replay</button></div>
    <div className="original-attempt"><span>FIRST HEARING · PRESERVED</span><p lang="ko">{cue.attempts[0]?.response}</p><small>{formatDate(cue.attempts[0]?.createdAt ?? cue.createdAt)} · before assistance</small></div>
    <details open><summary>Timing & state</summary><div className="timing-edit"><label>Start<input type="number" min="0" step="0.05" value={start} onChange={(event) => setStart(Math.max(0, Number(event.target.value)))} /></label><div><button type="button" onClick={() => setStart(Math.max(0, start - .1))}>−.1</button><button type="button" onClick={() => setStart(start + .1)}>+.1</button></div><label>End<input type="number" min="0" step="0.05" value={end ?? ""} placeholder="Point" onChange={(event) => setEnd(event.target.value === "" ? null : Math.max(0, Number(event.target.value)))} /></label><div><button type="button" disabled={end === null} onClick={() => setEnd((value) => value === null ? null : Math.max(start + .05, value - .1))}>−.1</button><button type="button" disabled={end === null} onClick={() => setEnd((value) => value === null ? null : value + .1)}>+.1</button></div></div><div className="state-grid"><label>State<select value={status} onChange={(event) => setStatus(event.target.value as SongCue["status"])}><option value="investigated">Investigated</option><option value="uncertain">Uncertain</option><option value="understood">Understood</option><option value="difficult">Difficult</option></select></label><label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value as SongCue["confidence"])}><option value="uncertain">Uncertain</option><option value="developing">Developing</option><option value="confident">Confident</option></select></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))}>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label></div></details>
    <div className="layer-fields">{LAYER_FIELDS.map((field, index) => <label key={field.kind} className={index > 2 ? "secondary-field" : ""}>{field.label}{field.area ? <textarea rows={2} value={fields[field.kind]} onChange={(event) => setFields({ ...fields, [field.kind]: event.target.value })} placeholder={field.placeholder} /> : <input value={fields[field.kind]} onChange={(event) => setFields({ ...fields, [field.kind]: event.target.value })} placeholder={field.placeholder} />}</label>)}</div>
    <label className="tag-field">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="chorus, contraction, favorite line" /></label>
    <button className="editor-save" type="submit">{saved ? "SAVED ✓" : "SAVE CHANGES"}</button>
  </form>;
}
