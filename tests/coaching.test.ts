import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { createCoachHandler } from "../app/api/coach/route.ts";
import {
  CoachingAnalysisSchema,
  type CoachingContext,
  type CoachingService,
} from "../app/lib/coaching/contracts.ts";
import { MockCoachingService } from "../app/lib/mock-ai.ts";
import { OpenAICoachingService } from "../app/lib/coaching/server/openai-coach.ts";
import { resolveCoachingService } from "../app/lib/coaching/server/provider.ts";

const context: CoachingContext = {
  mission: "I want to explain why learning Codex was mentally difficult today.",
  intendedMeaning: "I want to explain why learning Codex was mentally difficult today.",
  targetLanguage: { code: "ko", label: "Korean" },
  initialAttempt: "오늘 Codex 배우기 정신 힘들었어요",
  previousAttempts: ["오늘 Codex 배우기 정신 힘들었어요"],
  stage: "attempt",
};

function coachRequest(action = "analyze_attempt") {
  return new Request("http://localhost/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, context }),
  });
}

test("validates complete coaching analysis and rejects incomplete output", async () => {
  const valid = await new MockCoachingService().analyzeAttempt(context);
  assert.equal(CoachingAnalysisSchema.parse(valid).hints.length, 3);

  const invalid = CoachingAnalysisSchema.safeParse({
    understanding: "Mostly understood",
    hints: [],
  });
  assert.equal(invalid.success, false);
});

test("selects demo coach when API configuration is missing", () => {
  const resolved = resolveCoachingService({} as NodeJS.ProcessEnv);
  assert.equal(resolved.configuredLiveProvider, false);
  assert.equal(resolved.service.provider, "mock");
});

test("malformed model output is rejected by the live adapter", async () => {
  const live = new OpenAICoachingService("test-model", {
    async generate() { return { understanding: "missing almost everything" }; },
  });

  await assert.rejects(() => live.analyzeAttempt(context), ZodError);
});

test("route falls back to mock coaching after malformed live output", async () => {
  const malformed = new OpenAICoachingService("test-model", {
    async generate() { return { understanding: "incomplete" }; },
  });
  const handler = createCoachHandler({
    resolveService: () => ({ service: malformed, configuredLiveProvider: true }),
  });

  const response = await handler(coachRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.meta.provider, "mock");
  assert.equal(body.meta.demoMode, true);
  assert.ok(body.meta.validationFailures.length > 0);
  assert.equal(body.data.hints.length, 3);
});

test("route validates output from any injected provider, not only the OpenAI adapter", async () => {
  const demo = new MockCoachingService();
  const untrusted: CoachingService = {
    provider: "openai",
    model: "unvalidated-injected-service",
    async analyzeAttempt() { return { understanding: "incomplete" } as never; },
    evaluateRebuiltAttempt: (...args) => demo.evaluateRebuiltAttempt(...args),
    generateStressTestQuestions: (...args) => demo.generateStressTestQuestions(...args),
    evaluateStressTestAnswer: (...args) => demo.evaluateStressTestAnswer(...args),
    createSessionSummary: (...args) => demo.createSessionSummary(...args),
  };
  const response = await createCoachHandler({ resolveService: () => ({ service: untrusted, configuredLiveProvider: true }) })(coachRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.meta.provider, "mock");
  assert.ok(body.meta.validationFailures.length > 0);
});

test("end-to-end coaching request uses an injected live provider", async () => {
  const demo = new MockCoachingService();
  const live: CoachingService = {
    provider: "openai",
    model: "mocked-live-model",
    analyzeAttempt: (...args) => demo.analyzeAttempt(...args),
    evaluateRebuiltAttempt: (...args) => demo.evaluateRebuiltAttempt(...args),
    generateStressTestQuestions: (...args) => demo.generateStressTestQuestions(...args),
    evaluateStressTestAnswer: (...args) => demo.evaluateStressTestAnswer(...args),
    createSessionSummary: (...args) => demo.createSessionSummary(...args),
  };
  const handler = createCoachHandler({
    resolveService: () => ({ service: live, configuredLiveProvider: true }),
  });

  const response = await handler(coachRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.meta.provider, "openai");
  assert.equal(body.meta.model, "mocked-live-model");
  assert.equal(body.meta.demoMode, false);
  assert.equal(body.data.naturalVersion.includes("Codex"), true);
});

test("route preserves service with a safe fallback when provider throws", async () => {
  const failing: CoachingService = {
    provider: "openai",
    model: "failing-model",
    async analyzeAttempt() { throw new Error("secret upstream detail"); },
    async evaluateRebuiltAttempt() { throw new Error("not used"); },
    async generateStressTestQuestions() { throw new Error("not used"); },
    async evaluateStressTestAnswer() { throw new Error("not used"); },
    async createSessionSummary() { throw new Error("not used"); },
  };
  const handler = createCoachHandler({
    resolveService: () => ({ service: failing, configuredLiveProvider: true }),
  });

  const body = await (await handler(coachRequest())).json();
  assert.equal(body.meta.provider, "mock");
  assert.doesNotMatch(body.meta.error, /secret upstream detail/);
});
