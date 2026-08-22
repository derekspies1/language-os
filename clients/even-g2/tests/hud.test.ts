import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoDataSource, localLearningFeed } from '../src/local-fixture'
import { createInitialState, renderHud, updateHudState } from '../src/hud'
import { assertUsableLearningFeed } from '../src/learning-feed'

const snapshot = assertUsableLearningFeed(await localLearningFeed.load())
const data = createDemoDataSource(snapshot)

test('offline fixture preserves all 20 learning items', () => {
  assert.equal(snapshot.items.length, 20)
  assert.equal(data.getLanguageCount(), 20)
})

test('Language Glance preserves Korean, meaning, breakdown, next sequence', () => {
  let state = updateHudState(createInitialState(), 'nextMode', data)

  assert.equal(state.mode, 'LANGUAGE')
  assert.match(renderHud(state, data), /안녕하세요\? 오늘 기분이 어때요\?/)
  assert.doesNotMatch(renderHud(state, data), /How are you feeling/)

  state = updateHudState(state, 'reveal', data)
  assert.equal(state.language.revealStage, 'meaning')
  assert.match(renderHud(state, data), /How are you feeling today/)

  state = updateHudState(state, 'reveal', data)
  assert.equal(state.language.revealStage, 'breakdown')
  assert.match(renderHud(state, data), /기분 = mood, feeling/)

  state = updateHudState(state, 'reveal', data)
  assert.equal(state.language.itemIndex, 1)
  assert.equal(state.language.revealStage, 'korean')
  assert.match(renderHud(state, data), /^2 \/ 20/)
  assert.doesNotMatch(renderHud(state, data), /Today is a really good day/)
})

test('mode navigation remains available in both directions', () => {
  const initial = createInitialState()
  assert.equal(updateHudState(initial, 'nextMode', data).mode, 'LANGUAGE')
  assert.equal(updateHudState(initial, 'previousMode', data).mode, 'AI')
})

test('direct item navigation wraps and resets the reveal stage', () => {
  let state = updateHudState(createInitialState(), 'nextMode', data)
  state = updateHudState(state, 'reveal', data)
  assert.equal(state.language.revealStage, 'meaning')

  state = updateHudState(state, 'previousItem', data)
  assert.equal(state.language.itemIndex, 19)
  assert.equal(state.language.revealStage, 'korean')

  state = updateHudState(state, 'nextItem', data)
  assert.equal(state.language.itemIndex, 0)
  assert.equal(state.language.revealStage, 'korean')
})
