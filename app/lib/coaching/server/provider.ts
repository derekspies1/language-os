import type { CoachingService } from "../contracts";
import { mockCoach } from "../../mock-ai";
import { createOpenAICoach } from "./openai-coach";

export type ResolvedCoach = {
  service: CoachingService;
  configuredLiveProvider: boolean;
};

export function resolveCoachingService(env: NodeJS.ProcessEnv = process.env): ResolvedCoach {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { service: mockCoach, configuredLiveProvider: false };

  return {
    service: createOpenAICoach(apiKey, env.OPENAI_MODEL?.trim() || "gpt-5-mini"),
    configuredLiveProvider: true,
  };
}

