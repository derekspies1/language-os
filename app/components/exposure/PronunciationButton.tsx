"use client";

import { useState } from "react";
import { playPronunciation } from "../../lib/pronunciation/client";
import type { PronunciationLayer } from "../../lib/pronunciation/contracts";

export function PronunciationButton({
  text,
  layer,
  label,
  onPlayed,
}: {
  text: string;
  layer: PronunciationLayer;
  label: string;
  onPlayed: (layer: PronunciationLayer) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function play() {
    if (state === "loading") return;
    setState("loading");
    setError("");
    try {
      await playPronunciation(text, layer);
      onPlayed(layer);
      setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Natural Korean audio is unavailable.");
      setState("error");
    }
  }

  return <div className="pronunciation-control"><button type="button" onClick={play} disabled={state === "loading"} aria-label={`${label}: ${text}`}><span>{state === "loading" ? "Generating…" : "▶"}</span>{label}</button>{error && <small role="status">{error}</small>}</div>;
}
