import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import {
  CoachingAnalysisSchema,
  type CoachingAnalysis,
  type CoachingContext,
  type CoachingService,
  RebuildEvaluationSchema,
  type RebuildEvaluation,
  SessionSummarySchema,
  type SessionSummary,
  StressAnswerEvaluationSchema,
  type StressAnswerEvaluation,
  type StressQuestion,
  StressQuestionsSchema,
  type StressQuestions,
} from "../contracts";
import { LANGUAGE_COACH_SYSTEM_PROMPT, taskPrompt } from "./system-prompt";

export interface StructuredModelClient {
  generate<T>(schemaName: string, schema: ZodType<T>, prompt: string, signal?: AbortSignal): Promise<unknown>;
}

export class OpenAIStructuredModelClient implements StructuredModelClient {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate<T>(schemaName: string, schema: ZodType<T>, prompt: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        input: [
          { role: "system", content: LANGUAGE_COACH_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        text: { format: zodTextFormat(schema, schemaName) },
      },
      { signal },
    );

    if (!response.output_parsed) throw new Error("The model returned no structured coaching result.");
    return response.output_parsed;
  }
}

export class OpenAICoachingService implements CoachingService {
  readonly provider = "openai" as const;

  constructor(readonly model: string, private readonly client: StructuredModelClient) {}

  private async validated<T>(schemaName: string, schema: ZodType<T>, prompt: string, signal?: AbortSignal): Promise<T> {
    const candidate = await this.client.generate(schemaName, schema, prompt, signal);
    return schema.parse(candidate);
  }

  analyzeAttempt(context: CoachingContext, signal?: AbortSignal): Promise<CoachingAnalysis> {
    return this.validated(
      "coaching_analysis",
      CoachingAnalysisSchema,
      taskPrompt("Analyze the first attempt. Identify only the smallest gaps and create three progressively explicit hints.", context),
      signal,
    );
  }

  evaluateRebuiltAttempt(context: CoachingContext, rebuiltAttempt: string, signal?: AbortSignal): Promise<RebuildEvaluation> {
    return this.validated(
      "rebuild_evaluation",
      RebuildEvaluationSchema,
      taskPrompt("Evaluate the rebuilt attempt for conveyed meaning and naturalness. Name only the most useful next step.", { context, rebuiltAttempt }),
      signal,
    );
  }

  generateStressTestQuestions(context: CoachingContext, rebuiltAttempt: string, signal?: AbortSignal): Promise<StressQuestions> {
    return this.validated(
      "stress_questions",
      StressQuestionsSchema,
      taskPrompt("Create 2-3 short target-language questions that require reuse of the newly built language. Each hint must remain concise.", { context, rebuiltAttempt }),
      signal,
    );
  }

  evaluateStressTestAnswer(
    context: CoachingContext,
    question: StressQuestion,
    answer: string,
    signal?: AbortSignal,
  ): Promise<StressAnswerEvaluation> {
    return this.validated(
      "stress_answer_evaluation",
      StressAnswerEvaluationSchema,
      taskPrompt("Evaluate whether this short answer communicates an understandable response. Correct only the most important issue.", { context, question, answer }),
      signal,
    );
  }

  createSessionSummary(
    context: CoachingContext,
    rebuiltAttempt: string,
    stressAnswers: string[],
    signal?: AbortSignal,
  ): Promise<SessionSummary> {
    return this.validated(
      "session_summary",
      SessionSummarySchema,
      taskPrompt("Create a concise capability-focused summary using only language acquired or demonstrated in this session.", { context, rebuiltAttempt, stressAnswers }),
      signal,
    );
  }
}

export function createOpenAICoach(apiKey: string, model: string): OpenAICoachingService {
  return new OpenAICoachingService(model, new OpenAIStructuredModelClient(apiKey, model));
}

