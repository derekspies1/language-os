import type { HudAction } from './semantic-actions'

export const HUD_MODES = ['FOCUS', 'LANGUAGE', 'AI'] as const

export type HudMode = (typeof HUD_MODES)[number]

export interface FocusItem {
  intention: string
}

export interface LanguageItem {
  targetText: string
  naturalMeaning: string
  learnerBreakdown: readonly string[]
  note?: string
}

export interface AiExchange {
  question: string
  answer: string
}

/** Device-facing data already adapted from the narrower LearningFeed boundary. */
export interface HudDataSource {
  getFocus(): FocusItem
  getLanguage(index: number): LanguageItem
  getLanguageCount(): number
  getAiExchange(index: number): AiExchange
  getAiExchangeCount(): number
}

export type LanguageRevealStage = 'korean' | 'meaning' | 'breakdown'

export interface LanguageSessionState {
  itemIndex: number
  revealStage: LanguageRevealStage
  itemsViewed: number
  meaningRevealed: number
  meaningRevealedIndices: readonly number[]
}

export interface HudState {
  mode: HudMode
  language: LanguageSessionState
  aiExchangeIndex: number
}

export function createInitialState(): HudState {
  return {
    mode: 'FOCUS',
    language: {
      itemIndex: 0,
      revealStage: 'korean',
      itemsViewed: 1,
      meaningRevealed: 0,
      meaningRevealedIndices: [],
    },
    aiExchangeIndex: 0,
  }
}

function navigateLanguage(state: HudState, data: HudDataSource, direction: 1 | -1): HudState {
  const count = data.getLanguageCount()
  return {
    ...state,
    language: {
      ...state.language,
      itemIndex: (state.language.itemIndex + direction + count) % count,
      revealStage: 'korean',
      itemsViewed: state.language.itemsViewed + 1,
    },
  }
}

function revealLanguage(state: HudState, data: HudDataSource): HudState {
  const language = state.language

  if (language.revealStage === 'korean') {
    const alreadyRevealed = language.meaningRevealedIndices.includes(language.itemIndex)
    return {
      ...state,
      language: {
        ...language,
        revealStage: 'meaning',
        meaningRevealed: alreadyRevealed ? language.meaningRevealed : language.meaningRevealed + 1,
        meaningRevealedIndices: alreadyRevealed
          ? language.meaningRevealedIndices
          : [...language.meaningRevealedIndices, language.itemIndex],
      },
    }
  }

  if (language.revealStage === 'meaning') {
    return {
      ...state,
      language: { ...language, revealStage: 'breakdown' },
    }
  }

  return navigateLanguage(state, data, 1)
}

export function updateHudState(state: HudState, action: HudAction, data: HudDataSource): HudState {
  if (action === 'reveal') {
    if (state.mode === 'LANGUAGE') return revealLanguage(state, data)

    if (state.mode === 'AI') {
      return {
        ...state,
        aiExchangeIndex: (state.aiExchangeIndex + 1) % data.getAiExchangeCount(),
      }
    }

    return state
  }

  if (action === 'previousItem' || action === 'nextItem') {
    if (state.mode !== 'LANGUAGE') return state
    return navigateLanguage(state, data, action === 'nextItem' ? 1 : -1)
  }

  const direction = action === 'nextMode' ? 1 : -1
  const modeIndex = HUD_MODES.indexOf(state.mode)
  const nextIndex = (modeIndex + direction + HUD_MODES.length) % HUD_MODES.length

  return { ...state, mode: HUD_MODES[nextIndex] }
}

function renderLanguage(state: LanguageSessionState, data: HudDataSource): string {
  const item = data.getLanguage(state.itemIndex)
  const progress = `${state.itemIndex + 1} / ${data.getLanguageCount()}`

  if (state.revealStage === 'korean') return `${progress}\n\n${item.targetText}`
  if (state.revealStage === 'meaning') {
    return `${progress}\n\n${item.targetText}\n\n${item.naturalMeaning}`
  }

  const note = item.note ? `\n\n${item.note}` : ''
  return `${progress}\n\n${item.targetText}\n\n${item.learnerBreakdown.join('\n')}${note}`
}

export function renderHud(state: HudState, data: HudDataSource): string {
  const modePosition = HUD_MODES.indexOf(state.mode) + 1
  const header = `${state.mode}  ${modePosition}/${HUD_MODES.length}`

  if (state.mode === 'FOCUS') {
    return `${header}\n\n${data.getFocus().intention}\n\n▲ / ▼  CHANGE MODE`
  }

  if (state.mode === 'LANGUAGE') return renderLanguage(state.language, data)

  const exchange = data.getAiExchange(state.aiExchangeIndex)
  return `${header}\n\nQ  ${exchange.question}\n\nA  ${exchange.answer}\n\nPRESS FOR NEXT  ·  ▲ / ▼ MODE`
}
