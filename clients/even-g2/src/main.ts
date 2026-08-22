import {
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { createDemoDataSource, localLearningFeed } from './local-fixture'
import { createInitialState, renderHud, updateHudState } from './hud'
import { normalizeHardwareInput, resolveSemanticAction } from './input-policy'
import { assertUsableLearningFeed } from './learning-feed'
import type { HudAction, SemanticAction } from './semantic-actions'

const MAIN_CONTAINER_ID = 1
const MAIN_CONTAINER_NAME = 'language-os-even-g2'
const SCROLL_COOLDOWN_MS = 250

const feed = assertUsableLearningFeed(await localLearningFeed.load())
const data = createDemoDataSource(feed)
const bridge = await waitForEvenAppBridge()
let state = createInitialState()
let lastScrollAt = 0

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 12,
  containerID: MAIN_CONTAINER_ID,
  containerName: MAIN_CONTAINER_NAME,
  content: renderHud(state, data),
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [mainText] }),
)

console.log('Language OS Glance ready:', result === 0 ? 'success' : `failed (${result})`)

async function dispatch(action: HudAction): Promise<void> {
  const nextState = updateHudState(state, action, data)
  if (nextState === state) return

  state = nextState
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: MAIN_CONTAINER_ID,
      containerName: MAIN_CONTAINER_NAME,
      content: renderHud(state, data),
    }),
  )
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const input = normalizeHardwareInput(event)
  const action: SemanticAction | null = resolveSemanticAction(input, state.mode)

  if (import.meta.env.DEV) {
    console.debug('[Language OS input]', {
      gesture: input.gesture,
      reportedSource: input.source,
      reportedSourceValue: input.reportedSource,
      action,
    })
  }

  if (action === 'exit') {
    if (input.gesture === 'systemExit' || input.gesture === 'abnormalExit') {
      unsubscribe()
    } else {
      void bridge.shutDownPageContainer(1)
    }
    return
  }

  if (action === 'previousItem' || action === 'nextItem' || action === 'previousMode' || action === 'nextMode') {
    const now = Date.now()
    if (now - lastScrollAt >= SCROLL_COOLDOWN_MS) {
      lastScrollAt = now
      void dispatch(action as HudAction)
    }
    return
  }

  if (action === 'reveal') void dispatch(action)
})
