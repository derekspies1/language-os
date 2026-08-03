import type { SongAnalysis, SongAnalysisRequest, SongAnalysisService } from "./contracts";

export const ORIGINAL_DEMO = {
  title: "새벽의 문",
  artist: "Language OS Demo Unit",
  albumOrSource: "Original in-app demo · not a commercial song",
  personalNotes: "새벽에 다시 시작할 용기를 떠올리며 들어 보세요.",
  lyrics: [
    "불 꺼진 창에 새벽이 번져",
    "멈춘 마음도 다시 숨을 쉬어",
    "작은 목소리 길을 만들면",
    "오늘의 나는 어제를 넘어",
    "한 걸음 늦어도 괜찮아",
    "우리의 빛은 아직 여기 있어",
  ].join("\n"),
} as const;

const DEMO_MEANINGS: Record<string, Omit<SongAnalysis["lines"][number], "lineId" | "originalKorean">> = {
  "불 꺼진 창에 새벽이 번져": {
    naturalMeaning: "Dawn spreads across the darkened window.",
    structuralMeaning: "On the window whose light is off, dawn spreads.",
    segments: [
      { text: "불 꺼진 창에", meaning: "on the darkened window", role: "setting" },
      { text: "새벽이", meaning: "dawn", role: "subject" },
      { text: "번져", meaning: "spreads / diffuses", role: "image in motion" },
    ],
    vocabulary: [
      { id: "demo-번지다", surfaceForm: "번져", dictionaryForm: "번지다", meaningInLine: "spreads softly across a surface", broaderMeaning: "to spread, run, or diffuse", partOfSpeech: "verb", nuance: "Often used for light, color, sound, smiles, or emotion spreading.", reusability: "high", relatedForms: ["번져요", "번졌다"] },
      { id: "demo-새벽", surfaceForm: "새벽이", dictionaryForm: "새벽", meaningInLine: "dawn", partOfSpeech: "noun", nuance: "Can evoke solitude, beginnings, or a night not yet finished.", reusability: "high", relatedForms: ["새벽에", "이른 새벽"] },
    ],
    grammar: [
      { id: "demo-은-관형", formAsUsed: "꺼진", basePattern: "-(으)ㄴ", functionInLine: "turns the completed action 꺼지다 into a description of 창", explanation: "A past/completed modifier: ‘the window whose light has gone out.’", nearbyAlternative: "꺼지는 창 would foreground the light going out right now.", reusableExample: "문 닫힌 가게 앞에서 기다렸어요." },
    ],
    listeningCue: "Hear 불꺼진창에 as one setting unit, then 새벽이 / 번져.",
    nuance: "번지다 makes dawn feel gradual and almost physical, not like a sudden switch.",
    reviewPriority: "high",
  },
  "멈춘 마음도 다시 숨을 쉬어": {
    naturalMeaning: "Even a heart that stopped starts breathing again.",
    structuralMeaning: "The stopped heart too, again, breathes.",
    segments: [{ text: "멈춘 마음도", meaning: "even the heart that stopped" }, { text: "다시", meaning: "again" }, { text: "숨을 쉬어", meaning: "breathes" }],
    vocabulary: [{ id: "demo-숨을쉬다", surfaceForm: "숨을 쉬어", dictionaryForm: "숨을 쉬다", meaningInLine: "to breathe / come alive", broaderMeaning: "literally to breathe; figuratively to regain life", partOfSpeech: "verb phrase", nuance: "The lyric treats 마음 like a living body.", reusability: "high", relatedForms: ["숨을 쉬어요", "숨 쉬는"] }],
    grammar: [{ id: "demo-도", formAsUsed: "마음도", basePattern: "N도", functionInLine: "adds ‘even/also’ to the stopped heart", explanation: "도 widens the claim: even this exhausted heart can return.", reusableExample: "천천히 해도 괜찮아요." }],
    listeningCue: "Keep 숨을 쉬어 together; the object marker is often very light in singing.",
    nuance: "A hopeful personification: emotional recovery becomes breathing again.",
    reviewPriority: "high",
  },
  "작은 목소리 길을 만들면": {
    naturalMeaning: "If a small voice makes a path…",
    structuralMeaning: "If the small voice creates a road…",
    segments: [{ text: "작은 목소리", meaning: "a small voice" }, { text: "길을 만들면", meaning: "if it makes a path" }],
    vocabulary: [{ id: "demo-목소리", surfaceForm: "목소리", dictionaryForm: "목소리", meaningInLine: "voice", partOfSpeech: "noun", nuance: "Here it suggests a quiet but real act of expression.", reusability: "high", relatedForms: ["큰 목소리", "목소리를 내다"] }],
    grammar: [{ id: "demo-으면", formAsUsed: "만들면", basePattern: "-(으)면", functionInLine: "sets up a condition", explanation: "‘If/when it makes…’ The result arrives in the next line.", reusableExample: "매일 들으면 더 잘 들려요." }],
    listeningCue: "The line does not finish semantically; hold 만들면 open for the next line.",
    nuance: "A ‘small’ voice creating a ‘path’ makes quiet expression feel consequential.",
    reviewPriority: "medium",
  },
  "오늘의 나는 어제를 넘어": {
    naturalMeaning: "The me of today goes beyond yesterday.",
    structuralMeaning: "Today’s I crosses beyond yesterday.",
    segments: [{ text: "오늘의 나는", meaning: "as for today’s me" }, { text: "어제를 넘어", meaning: "goes beyond yesterday" }],
    vocabulary: [{ id: "demo-넘다", surfaceForm: "넘어", dictionaryForm: "넘다", meaningInLine: "goes beyond / overcomes", broaderMeaning: "to cross, exceed, pass beyond", partOfSpeech: "verb", nuance: "Turns time into a boundary that can be crossed.", reusability: "high", relatedForms: ["넘어요", "넘어서", "뛰어넘다"] }],
    grammar: [{ id: "demo-의", formAsUsed: "오늘의 나", basePattern: "N의 N", functionInLine: "links today to a version of the self", explanation: "Poetic noun linking: ‘today’s me.’ Everyday speech might simply say 오늘 나는.", nearbyAlternative: "오늘 나는 is plainer and more conversational.", reusableExample: "지금의 나를 믿어요." }],
    listeningCue: "Hear 오늘의나 as a single image; the topic is marked by 는.",
    nuance: "Slightly poetic. It frames growth as one version of the self passing another.",
    reviewPriority: "high",
  },
  "한 걸음 늦어도 괜찮아": {
    naturalMeaning: "It’s okay even if you’re one step behind.",
    structuralMeaning: "Even if (you are) one step late, it is okay.",
    segments: [{ text: "한 걸음", meaning: "one step" }, { text: "늦어도", meaning: "even if late" }, { text: "괜찮아", meaning: "it’s okay" }],
    vocabulary: [{ id: "demo-걸음", surfaceForm: "한 걸음", dictionaryForm: "걸음", meaningInLine: "one step", partOfSpeech: "noun", nuance: "Measures progress in a human, physical way.", reusability: "high", relatedForms: ["두 걸음", "걸음을 옮기다"] }],
    grammar: [{ id: "demo-아도", formAsUsed: "늦어도", basePattern: "-아/어도", functionInLine: "concedes a condition that does not change the conclusion", explanation: "‘Even if you are late…’ followed by reassurance.", reusableExample: "조금 틀려도 괜찮아요." }],
    listeningCue: "The emotional landing is 괜찮아; let 늦어도 lean into it.",
    nuance: "Casual intimate reassurance. 괜찮아요 would create more polite distance.",
    reviewPriority: "high",
  },
  "우리의 빛은 아직 여기 있어": {
    naturalMeaning: "Our light is still here.",
    structuralMeaning: "As for our light, it still exists here.",
    segments: [{ text: "우리의 빛은", meaning: "as for our light" }, { text: "아직", meaning: "still / yet" }, { text: "여기 있어", meaning: "is here" }],
    vocabulary: [{ id: "demo-아직", surfaceForm: "아직", dictionaryForm: "아직", meaningInLine: "still", broaderMeaning: "still; not yet, depending on the sentence", partOfSpeech: "adverb", nuance: "Signals that something remains despite pressure or time.", reusability: "high", relatedForms: ["아직도", "아직 안"] }],
    grammar: [{ id: "demo-은-topic", formAsUsed: "빛은", basePattern: "N은/는", functionInLine: "sets ‘our light’ as the reassuring topic", explanation: "The topic marker gives the line a contrastive undertone: whatever else changed, the light remains.", reusableExample: "희망은 아직 있어요." }],
    listeningCue: "Listen for the compact ending 여기있어, common in casual speech and lyrics.",
    nuance: "Warm, collective, and intimate. 있어 asserts continuing presence rather than dramatic triumph.",
    reviewPriority: "medium",
  },
};

function genericDemoLine(line: SongAnalysisRequest["lines"][number], index: number): SongAnalysis["lines"][number] {
  return {
    lineId: line.id,
    originalKorean: line.text,
    naturalMeaning: line.suppliedTranslation || "Meaning stays hidden in demo mode for learner-supplied text.",
    structuralMeaning: "A live coach can create a validated structural reading for this line.",
    segments: [{ text: line.text, meaning: "Listen for this as one complete unit." }],
    vocabulary: [],
    grammar: [],
    listeningCue: index % 2 === 0 ? "Tap the rhythm and listen for the line ending." : "Notice where the singer groups the phrase, not only the written spacing.",
    nuance: "Demo mode does not invent a detailed interpretation of learner-supplied lyrics.",
    reviewPriority: "medium",
  };
}

export function createDemoSongAnalysis(input: SongAnalysisRequest): SongAnalysis {
  const lines = input.lines.map((line, index) => {
    const rich = DEMO_MEANINGS[line.text];
    return rich ? { lineId: line.id, originalKorean: line.text, ...rich } : genericDemoLine(line, index);
  });
  const richCount = lines.filter((line) => line.vocabulary.length > 0 || line.grammar.length > 0).length;
  return {
    overview: richCount === lines.length ? "A quiet song about beginning again: dawn, breath, voice, and light turn recovery into physical images." : "A Korean-first listening session. Detailed demo analysis is available for the original in-app song; supplied text remains usable without invented claims.",
    overallTone: richCount === lines.length ? "Intimate, hopeful, and gently determined." : "Learner-directed listening mode.",
    recurringIdeas: richCount === lines.length ? ["starting again", "quiet courage", "crossing a boundary", "shared light"] : ["sound grouping", "line endings", "learner interpretation"],
    repeatedVocabulary: richCount === lines.length ? ["다시", "아직", "마음", "빛"] : [],
    repeatedGrammar: richCount === lines.length ? ["은/는", "-아/어도", "-(으)면"] : [],
    stylisticFeatures: richCount === lines.length ? ["personification", "time as physical space", "casual intimate endings"] : ["Korean-first progressive reveal"],
    learningPriorities: richCount === lines.length ? ["Hear each phrase boundary before reading the meaning", "Reuse -아/어도 괜찮아 for reassurance", "Notice how images carry emotion"] : ["Record a guess before revealing any supplied translation", "Mark unstable lines", "Use a live coach for detailed analysis"],
    lines,
    partial: richCount !== lines.length,
    omittedLineIds: [],
  };
}

export class MockSongAnalysisService implements SongAnalysisService {
  readonly provider = "mock" as const;
  readonly model = "language-os-song-demo-v1";
  async analyzeSong(input: SongAnalysisRequest): Promise<SongAnalysis> {
    return createDemoSongAnalysis(input);
  }
}

export const mockSongAnalyzer = new MockSongAnalysisService();

