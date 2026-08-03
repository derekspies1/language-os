import type { SongAnalysisService } from "../contracts";
import { mockSongAnalyzer } from "../demo";
import { createOpenAISongAnalyzer } from "./openai-song-analyzer";

export type ResolvedSongAnalyzer = {
  service: SongAnalysisService;
  configuredLiveProvider: boolean;
};

export function resolveSongAnalysisService(env: NodeJS.ProcessEnv = process.env): ResolvedSongAnalyzer {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { service: mockSongAnalyzer, configuredLiveProvider: false };
  return {
    service: createOpenAISongAnalyzer(apiKey, env.OPENAI_MODEL?.trim() || "gpt-5-mini"),
    configuredLiveProvider: true,
  };
}

