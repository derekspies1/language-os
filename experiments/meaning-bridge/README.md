# Meaning Bridge

Meaning Bridge is a local Korean learning video player built to test one loop: **hear Korean → understand the English meaning → hear the same Korean again**. It is an experimental standalone prototype, with the transcript, playback adapters, bridge sequence, and learner state separated so they can later move into LanguageOS.

## Install and run

Requires Node.js 20.19+ or 22.12+ and npm.

```powershell
cd experiments/meaning-bridge
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://127.0.0.1:5173/`. To check a production build, run `npm run build`.

## Try the sample

The app opens with seven sample Korean lines. The browser's Korean text-to-speech voice speaks each line, so you can try the Bridge loop without a video. Voice availability and pronunciation depend on Windows and the browser. The sample transcript is demonstration content, **not synchronized to an external video**.

Click a transcript line to hear it. Use **BRIDGE** for Korean → English meaning → Korean. The other controls replay Korean, reveal the meaning, loop the line, stop, or move between lines. Bridge settings control pause length, English speech, and English text. Progress counts are saved in browser localStorage.

## Use a real video and transcript

Choose **Local video** to load a file from your computer, or paste a YouTube URL and select **Load**. Videos stay on your computer when loaded locally. The YouTube source uses the IFrame Player API and requires internet access; embedding or autoplay restrictions on a video can prevent playback. Direct YouTube caption extraction is outside this prototype.

Load a matching JSON transcript with **Load JSON transcript**. Its timestamps must be seconds into the chosen video:

```json
[
  {
    "id": "u1",
    "start": 18.4,
    "end": 20.9,
    "korean": "저는 진짜 몰랐어요.",
    "english": "I really had no idea."
  }
]
```

The built-in sample is [`src/data/sample-transcript.json`](src/data/sample-transcript.json). Replace that file to change the default. Each line needs a unique `id`, numeric `start` and `end` (`end > start`), Korean text, and English text. The loader sorts lines by start time. JSON transcript uploads are used for the current session; progress persists by utterance ID in localStorage.

## Architecture

- `src/core/transcript.ts`: timestamped utterance model and validation.
- `src/core/transcriptSources.ts`: sample and JSON file loaders behind `TranscriptSource`. Add subtitle or caption adapters here later.
- `src/core/playback.ts`: common `PlaybackController` interface with local video, YouTube, and sample speech adapters. The Bridge logic only uses this interface.
- `src/core/bridgeMachine.ts`: explicit `idle → korean_first → pause_after_korean → meaning → pause_after_meaning → korean_return → complete` sequence, plus single and loop playback. An AbortController cancels in-flight sequences when the user changes controls.
- `src/core/learnerState.ts`: local progress shape and localStorage persistence.
- `src/components/MediaPlayer.tsx`: source-specific player UI and adapter creation.
- `src/App.tsx`: learner controls, transcript panel, and settings.

To integrate into LanguageOS, move the `core` modules and playback adapters, add transcript source adapters and a shared learner-state repository, and connect its media and account services. A useful next step is importing SRT/VTT subtitles and aligning translations with precise utterance boundaries.
