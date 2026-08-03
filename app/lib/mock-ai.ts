import {
  type CoachingAnalysis,
  type CoachingContext,
  type CoachingService,
  type RebuildEvaluation,
  type SessionSummary,
  type StressAnswerEvaluation,
  type StressQuestion,
  type StressQuestions,
} from "./coaching/contracts";

const koreanAnalysis: CoachingAnalysis = {
  understanding: "You want to explain why learning Codex felt mentally difficult today.",
  observation: "The core topic and feeling are present. The smallest useful step is to connect the activity, past experience, and reason naturally.",
  successes: ["The attempt commits to the intended topic", "The central feeling is recoverable"],
  missingPieces: [
    "a natural way to make ‘learning Codex’ the topic",
    "a connector for ‘the reason why’",
    "the phrase for ‘mentally difficult’",
  ],
  hints: [
    { label: "A few useful pieces", content: "오늘 · today   /   정신적으로 · mentally   /   힘들었어요 · was difficult" },
    { label: "Shape the thought", content: "[오늘 + activity]가/게 [정신적으로 힘들었던] 이유를 설명하고 싶어요.\nUse -는 게 to make an action the topic." },
    { label: "A natural full version", content: "오늘 Codex를 배우는 게 정신적으로 힘들었던 이유를 설명하고 싶어요." },
  ],
  vocabulary: [
    { target: "정신적으로", meaning: "mentally" },
    { target: "힘들다", meaning: "to be difficult / exhausting" },
    { target: "이유", meaning: "reason" },
  ],
  patterns: [
    { pattern: "-는 게", meaning: "turns an action into a topic: ‘doing …’" },
    { pattern: "-었던", meaning: "describes a recalled past experience" },
    { pattern: "-고 싶어요", meaning: "I want to …" },
  ],
  naturalVersion: "오늘 Codex를 배우는 게 정신적으로 힘들었던 이유를 설명하고 싶어요.",
  breakdown: [
    "오늘 — today",
    "Codex를 배우는 게 — learning Codex",
    "정신적으로 힘들었던 이유를 — the reason it was mentally difficult",
    "설명하고 싶어요 — I want to explain",
  ],
};

const koreanQuestions: StressQuestion[] = [
  { target: "오늘 뭐가 가장 힘들었어요?", meaning: "What was the hardest part today?", hints: ["Start with: 가장 힘들었던 건…", "Name one specific difficulty."] },
  { target: "왜 그렇게 느꼈어요?", meaning: "Why did you feel that way?", hints: ["Give a reason with -기 때문에.", "Keep it to one short sentence."] },
  { target: "내일은 어떻게 해 보고 싶어요?", meaning: "What would you like to try tomorrow?", hints: ["Reuse -고 싶어요.", "Say one thing you want to try."] },
];

function genericAnalysis(context: CoachingContext): CoachingAnalysis {
  return {
    understanding: context.intendedMeaning,
    observation: `Your attempt creates a real starting point for the ${context.targetLanguage.label} coach. Demo mode is most detailed for Korean.`,
    successes: ["You attempted the meaning before seeing a model", "Your attempt gives the coach concrete evidence"],
    missingPieces: ["the main action", "a connector for the reason", "a natural closing phrase"],
    hints: [
      { label: "One useful clue", content: `Find the ${context.targetLanguage.label} word for the feeling at the center of your mission.` },
      { label: "Shape the thought", content: "[time] + [activity] + [feeling] + [reason or intention]" },
      { label: "Demo-mode model", content: "Use your own rebuilt version here. A configured live coach will supply a natural mission-specific version." },
    ],
    vocabulary: [{ target: "Core feeling", meaning: "the emotion or difficulty in your mission" }],
    patterns: [{ pattern: "time + action + feeling", meaning: "a reusable narrative frame" }],
    naturalVersion: context.initialAttempt,
    breakdown: ["time", "activity", "feeling", "reason or intention"],
  };
}

export class MockCoachingService implements CoachingService {
  readonly provider = "mock" as const;
  readonly model = "language-os-demo-v1";

  async analyzeAttempt(context: CoachingContext, _signal?: AbortSignal): Promise<CoachingAnalysis> {
    void _signal;
    return context.targetLanguage.code === "ko" ? koreanAnalysis : genericAnalysis(context);
  }

  async evaluateRebuiltAttempt(_context: CoachingContext, rebuiltAttempt: string, _signal?: AbortSignal): Promise<RebuildEvaluation> {
    void _signal;
    return {
      progress: "The rebuilt attempt is more complete and ready to test in a new context.",
      communicatedMeaning: rebuiltAttempt.trim().length > 4,
      nextStep: "Reuse the most important phrase in a short answer.",
      naturalVersion: rebuiltAttempt,
    };
  }

  async generateStressTestQuestions(context: CoachingContext, _rebuiltAttempt: string, _signal?: AbortSignal): Promise<StressQuestions> {
    void _rebuiltAttempt;
    void _signal;
    if (context.targetLanguage.code === "ko") return { questions: koreanQuestions };
    return {
      questions: [
        { target: "What was the hardest part?", meaning: `Answer in ${context.targetLanguage.label}.`, hints: ["Name one specific difficulty."] },
        { target: "Why did it feel that way?", meaning: `Answer in ${context.targetLanguage.label}.`, hints: ["Add a reason connector."] },
      ],
    };
  }

  async evaluateStressTestAnswer(_context: CoachingContext, _question: StressQuestion, answer: string, _signal?: AbortSignal): Promise<StressAnswerEvaluation> {
    void _signal;
    return {
      understood: answer.trim().length > 2,
      feedback: "Your answer reuses the new language in a fresh context.",
      nextStep: "Keep the same structure and change one detail.",
      naturalVersion: answer,
    };
  }

  async createSessionSummary(context: CoachingContext, rebuiltAttempt: string, _stressAnswers: string[], _signal?: AbortSignal): Promise<SessionSummary> {
    void _stressAnswers;
    void _signal;
    const analysis = context.targetLanguage.code === "ko" ? koreanAnalysis : genericAnalysis(context);
    return {
      capability: `Express the mission in ${context.targetLanguage.label} and reuse its core structure.`,
      improvedFinalVersion: rebuiltAttempt,
      words: analysis.vocabulary,
      patterns: analysis.patterns,
      reviewChallenge: `Without looking back, express a similar experience and reuse ${analysis.patterns[0].pattern}.`,
    };
  }
}

export const mockCoach = new MockCoachingService();

export { languages } from "./coaching/contracts";
export type { CoachingAnalysis, StressQuestion } from "./coaching/contracts";
