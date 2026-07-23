import { ZodError } from "zod";
import {
  CoachRequestSchema,
  type CoachRequest,
  type CoachingService,
} from "../../lib/coaching/contracts";
import { mockCoach } from "../../lib/mock-ai";
import {
  resolveCoachingService,
  type ResolvedCoach,
} from "../../lib/coaching/server/provider";

type HandlerOptions = {
  resolveService?: () => ResolvedCoach;
  fallbackService?: CoachingService;
};

function sanitizedError(error: unknown): string {
  if (error instanceof ZodError) return "The coach returned an incomplete structured response.";
  if (error instanceof Error && error.name === "AbortError") return "The coaching request was cancelled.";
  return "The live coach was unavailable, so demo coaching was used.";
}

function validationFailures(error: unknown): string[] {
  if (!(error instanceof ZodError)) return [];
  return error.issues.slice(0, 5).map((issue) => issue.path.join(".") || "response");
}

async function execute(service: CoachingService, request: CoachRequest, signal: AbortSignal) {
  switch (request.action) {
    case "analyze_attempt":
      return service.analyzeAttempt(request.context, signal);
    case "evaluate_rebuild": {
      const [evaluation, stress] = await Promise.all([
        service.evaluateRebuiltAttempt(request.context, request.rebuiltAttempt, signal),
        service.generateStressTestQuestions(request.context, request.rebuiltAttempt, signal),
      ]);
      return { evaluation, questions: stress.questions };
    }
    case "evaluate_stress":
      return service.evaluateStressTestAnswer(request.context, request.question, request.answer, signal);
    case "complete_session":
      return service.createSessionSummary(request.context, request.rebuiltAttempt, request.stressAnswers, signal);
  }
}

export function createCoachHandler(options: HandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = Date.now();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const parsed = CoachRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "The coaching request is incomplete.", fields: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 8) },
        { status: 400 },
      );
    }

    const resolved = (options.resolveService ?? resolveCoachingService)();
    const fallback = options.fallbackService ?? mockCoach;
    let activeService = resolved.service;
    let error: unknown = null;
    let data: unknown;

    try {
      data = await execute(activeService, parsed.data, request.signal);
    } catch (caught) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      error = caught;
      activeService = fallback;
      data = await execute(fallback, parsed.data, request.signal);
    }

    return Response.json({
      data,
      meta: {
        provider: activeService.provider,
        model: activeService.model,
        demoMode: activeService.provider === "mock",
        responseTimeMs: Date.now() - startedAt,
        validationFailures: validationFailures(error),
        error: error ? sanitizedError(error) : null,
        liveProviderConfigured: resolved.configuredLiveProvider,
      },
    });
  };
}

export const POST = createCoachHandler();

export async function GET(): Promise<Response> {
  const resolved = resolveCoachingService();
  return Response.json({
    provider: resolved.service.provider,
    model: resolved.service.model,
    demoMode: resolved.service.provider === "mock",
  });
}
