/**
 * Public client-side boundary for a future Language OS learning feed.
 *
 * Implementations may fetch a versioned public API, but must not import Language OS
 * database, server, recommendation, or learner-memory internals.
 */
export interface LearningFeedItem {
  readonly id: string
  readonly targetLanguage: string
  readonly targetText: string
  readonly naturalMeaning: string
  readonly learnerBreakdown: readonly string[]
  readonly note?: string
}

export interface LearningFeedSnapshot {
  readonly schemaVersion: 1
  readonly generatedAt: string | null
  readonly items: readonly LearningFeedItem[]
}

export interface LearningFeed {
  load(): Promise<LearningFeedSnapshot>
}

export function assertUsableLearningFeed(snapshot: LearningFeedSnapshot): LearningFeedSnapshot {
  if (snapshot.schemaVersion !== 1 || snapshot.items.length === 0) {
    throw new Error('Learning feed must use schema version 1 and contain at least one item')
  }

  return snapshot
}
