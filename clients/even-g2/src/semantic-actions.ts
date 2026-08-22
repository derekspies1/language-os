export type SemanticAction =
  | 'reveal'
  | 'previousItem'
  | 'nextItem'
  | 'previousMode'
  | 'nextMode'
  | 'exit'

export type HudAction = Exclude<SemanticAction, 'exit'>
