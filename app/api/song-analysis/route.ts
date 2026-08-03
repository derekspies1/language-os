import { ZodError } from "zod";
import type { SongAnalysisService } from "../../lib/song-analysis/contracts";
import { SongAnalysisRequestSchema, validateSongAnalysisForRequest } from "../../lib/song-analysis/contracts";
import { mockSongAnalyzer } from "../../lib/song-analysis/demo";
import {
  resolveSongAnalysisService,
  type ResolvedSongAnalyzer,
} from "../../lib/song-analysis/server/provider";

type HandlerOptions = {
  resolveService?: () => ResolvedSongAnalyzer;
  fallbackService?: SongAnalysisService;
};

function safeMessage(error: unknown): string {
  if (error instanceof ZodError) return "The live analyzer returned an incomplete structured response, so demo analysis was used.";
  return "The live analyzer was unavailable, so clearly labeled demo analysis was used.";
}

export function createSongAnalysisHandler(options: HandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = Date.now();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = SongAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({
        error: "The song session is incomplete.",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 10),
      }, { status: 400 });
    }

    const resolved = (options.resolveService ?? resolveSongAnalysisService)();
    const fallback = options.fallbackService ?? mockSongAnalyzer;
    let active = resolved.service;
    let caught: unknown = null;
    let data;
    try {
      data = validateSongAnalysisForRequest(parsed.data, await active.analyzeSong(parsed.data, request.signal));
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      caught = error;
      active = fallback;
      try {
        data = validateSongAnalysisForRequest(parsed.data, await fallback.analyzeSong(parsed.data, request.signal));
      } catch {
        return Response.json({ error: "The analyzer and its safe fallback could not produce a valid response." }, { status: 502 });
      }
    }

    return Response.json({
      data,
      meta: {
        provider: active.provider,
        model: active.model,
        demoMode: active.provider === "mock",
        responseTimeMs: Date.now() - startedAt,
        validationFailures: caught instanceof ZodError
          ? caught.issues.slice(0, 5).map((issue) => issue.path.join(".") || "response")
          : [],
        error: caught ? safeMessage(caught) : null,
        liveProviderConfigured: resolved.configuredLiveProvider,
      },
    });
  };
}

export const POST = createSongAnalysisHandler();

export async function GET(): Promise<Response> {
  const resolved = resolveSongAnalysisService();
  return Response.json({
    provider: resolved.service.provider,
    model: resolved.service.model,
    demoMode: resolved.service.provider === "mock",
  });
}
