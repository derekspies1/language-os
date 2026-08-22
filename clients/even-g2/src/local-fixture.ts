import type { AiExchange, FocusItem, HudDataSource } from './hud'
import type { LearningFeed, LearningFeedSnapshot } from './learning-feed'

const focus: FocusItem = { intention: 'Finish G2 prototype' }

const localSnapshot = {
  schemaVersion: 1,
  generatedAt: null,
  items: [
    {
      id: 'ko-local-01', targetLanguage: 'ko', targetText: '안녕하세요? 오늘 기분이 어때요?',
      naturalMeaning: 'Hi. How are you feeling today?',
      learnerBreakdown: ['오늘 = today', '기분 = mood, feeling', '어때요? = how is it?'],
      note: 'A natural, polite greeting.',
    },
    {
      id: 'ko-local-02', targetLanguage: 'ko', targetText: '오늘은 정말 좋은 날이에요.',
      naturalMeaning: 'Today is a really good day.',
      learnerBreakdown: ['오늘 = today', '정말 = really', '좋은 = good', '날 = day'],
    },
    {
      id: 'ko-local-03', targetLanguage: 'ko', targetText: '지금 뭐 하고 있어요?',
      naturalMeaning: 'What are you doing right now?',
      learnerBreakdown: ['지금 = now', '뭐 = what', '-고 있어요 = action in progress'],
    },
    {
      id: 'ko-local-04', targetLanguage: 'ko', targetText: '커피 한 잔 마시고 싶어요.',
      naturalMeaning: "I'd like a cup of coffee.",
      learnerBreakdown: ['한 잔 = one cup', '마시다 = to drink', '-고 싶어요 = want to'],
    },
    {
      id: 'ko-local-05', targetLanguage: 'ko', targetText: '여기에서 지하철역까지 멀어요?',
      naturalMeaning: 'Is the subway station far from here?',
      learnerBreakdown: ['여기에서 = from here', '지하철역 = subway station', '-까지 = to, as far as', '멀어요? = is it far?'],
    },
    {
      id: 'ko-local-06', targetLanguage: 'ko', targetText: '이거 얼마예요?',
      naturalMeaning: 'How much is this?',
      learnerBreakdown: ['이거 = this', '얼마 = how much', '-예요? = is it?'],
    },
    {
      id: 'ko-local-07', targetLanguage: 'ko', targetText: '괜찮아요, 천천히 하세요.',
      naturalMeaning: "It's okay. Take your time.",
      learnerBreakdown: ['괜찮아요 = it is okay', '천천히 = slowly', '-세요 = polite request'],
    },
    {
      id: 'ko-local-08', targetLanguage: 'ko', targetText: '오늘 저녁에 시간 있어요?',
      naturalMeaning: 'Do you have time this evening?',
      learnerBreakdown: ['오늘 저녁 = this evening', '시간 = time', '있어요? = do you have?'],
    },
    {
      id: 'ko-local-09', targetLanguage: 'ko', targetText: '저는 매운 음식을 잘 못 먹어요.',
      naturalMeaning: "I'm not good at eating spicy food.",
      learnerBreakdown: ['매운 = spicy', '음식 = food', '잘 못 = cannot do well', '먹어요 = eat'],
    },
    {
      id: 'ko-local-10', targetLanguage: 'ko', targetText: '비가 와서 우산을 가져왔어요.',
      naturalMeaning: 'It was raining, so I brought an umbrella.',
      learnerBreakdown: ['비가 오다 = to rain', '-아서/어서 = because, so', '우산 = umbrella', '가져오다 = to bring'],
    },
    {
      id: 'ko-local-11', targetLanguage: 'ko', targetText: '주말에는 보통 집에서 쉬어요.',
      naturalMeaning: 'On weekends I usually rest at home.',
      learnerBreakdown: ['주말 = weekend', '보통 = usually', '집에서 = at home', '쉬어요 = rest'],
    },
    {
      id: 'ko-local-12', targetLanguage: 'ko', targetText: '길을 잃은 것 같아요.',
      naturalMeaning: "I think I'm lost.",
      learnerBreakdown: ['길을 잃다 = to get lost', '-은 것 같아요 = it seems, I think'],
    },
    {
      id: 'ko-local-13', targetLanguage: 'ko', targetText: '사진 좀 찍어 주실래요?',
      naturalMeaning: 'Could you take a photo for me?',
      learnerBreakdown: ['사진 = photo', '좀 = softens the request', '찍다 = to take a photo', '-어 주실래요? = would you do it for me?'],
    },
    {
      id: 'ko-local-14', targetLanguage: 'ko', targetText: '생각보다 훨씬 재미있어요.',
      naturalMeaning: "It's much more fun than I expected.",
      learnerBreakdown: ['생각보다 = than expected', '훨씬 = much, far', '재미있어요 = is fun, interesting'],
    },
    {
      id: 'ko-local-15', targetLanguage: 'ko', targetText: '아직 결정하지 못했어요.',
      naturalMeaning: "I haven't decided yet.",
      learnerBreakdown: ['아직 = still, yet', '결정하다 = to decide', '-지 못했어요 = could not'],
    },
    {
      id: 'ko-local-16', targetLanguage: 'ko', targetText: '내일 일찍 일어나야 해요.',
      naturalMeaning: 'I have to wake up early tomorrow.',
      learnerBreakdown: ['내일 = tomorrow', '일찍 = early', '일어나다 = to wake up', '-아/어야 해요 = have to'],
    },
    {
      id: 'ko-local-17', targetLanguage: 'ko', targetText: '한국어를 배운 지 일 년 됐어요.',
      naturalMeaning: "It's been a year since I started learning Korean.",
      learnerBreakdown: ['한국어 = Korean language', '-은 지 = since doing', '일 년 = one year', '됐어요 = it has been'],
    },
    {
      id: 'ko-local-18', targetLanguage: 'ko', targetText: '혹시 추천해 주실 수 있어요?',
      naturalMeaning: 'Could you recommend something?',
      learnerBreakdown: ['혹시 = by any chance', '추천하다 = to recommend', '-실 수 있어요? = are you able to?'],
    },
    {
      id: 'ko-local-19', targetLanguage: 'ko', targetText: '별일 없으면 같이 점심 먹어요.',
      naturalMeaning: "If nothing comes up, let's have lunch together.",
      learnerBreakdown: ['별일 = something unusual', '-으면 = if', '같이 = together', '점심 = lunch'],
    },
    {
      id: 'ko-local-20', targetLanguage: 'ko', targetText: '덕분에 많이 배웠어요.',
      naturalMeaning: 'I learned a lot thanks to you.',
      learnerBreakdown: ['덕분에 = thanks to', '많이 = a lot', '배웠어요 = learned'],
    },
  ],
} as const satisfies LearningFeedSnapshot

export const localLearningFeed: LearningFeed = {
  async load() {
    return localSnapshot
  },
}

const aiExchanges: readonly AiExchange[] = [
  { question: 'What matters now?', answer: 'Make one mode feel effortless.' },
  { question: 'Best next step?', answer: 'Test it on the actual glasses.' },
]

export function createDemoDataSource(snapshot: LearningFeedSnapshot): HudDataSource {
  const items = snapshot.items.map(item => ({
    targetText: item.targetText,
    naturalMeaning: item.naturalMeaning,
    learnerBreakdown: item.learnerBreakdown,
    ...(item.note ? { note: item.note } : {}),
  }))

  return {
    getFocus: () => focus,
    getLanguage: index => items[index] ?? items[0],
    getLanguageCount: () => items.length,
    getAiExchange: index => aiExchanges[index] ?? aiExchanges[0],
    getAiExchangeCount: () => aiExchanges.length,
  }
}
