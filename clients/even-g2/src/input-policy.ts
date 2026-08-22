import {
  EventSourceType,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import type { HudMode } from './hud'
import type { SemanticAction } from './semantic-actions'

export type HardwareGesture =
  | 'click'
  | 'swipeUp'
  | 'swipeDown'
  | 'doubleClick'
  | 'systemExit'
  | 'abnormalExit'
  | 'other'

export type HardwareSource = 'ring' | 'glassesRight' | 'glassesLeft' | 'unknown'

export interface NormalizedHardwareInput {
  readonly gesture: HardwareGesture
  readonly source: HardwareSource
  readonly reportedSource: EventSourceType | null
}

function eventTypeOf(event: EvenHubEvent): OsEventTypeList | null {
  const explicitType =
    event.textEvent?.eventType ??
    event.listEvent?.eventType ??
    event.sysEvent?.eventType ??
    OsEventTypeList.fromJson(event.jsonData?.eventType)

  if (explicitType !== undefined) return explicitType

  // Simulator 0.8.0 reports Click as a source-only sysEvent. This preserves
  // the existing glasses-only behavior without guessing for empty events.
  if (event.sysEvent?.eventSource !== undefined || event.jsonData?.eventSource !== undefined) {
    return OsEventTypeList.CLICK_EVENT
  }

  return null
}

function sourceOf(event: EvenHubEvent): EventSourceType | null {
  const source =
    event.sysEvent?.eventSource ?? EventSourceType.fromJson(event.jsonData?.eventSource)
  return source ?? null
}

function normalizeGesture(type: OsEventTypeList | null): HardwareGesture {
  if (type === OsEventTypeList.CLICK_EVENT) return 'click'
  if (type === OsEventTypeList.SCROLL_TOP_EVENT) return 'swipeUp'
  if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) return 'swipeDown'
  if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) return 'doubleClick'
  if (type === OsEventTypeList.SYSTEM_EXIT_EVENT) return 'systemExit'
  if (type === OsEventTypeList.ABNORMAL_EXIT_EVENT) return 'abnormalExit'
  return 'other'
}

function normalizeSource(source: EventSourceType | null): HardwareSource {
  if (source === EventSourceType.TOUCH_EVENT_FROM_RING) return 'ring'
  if (source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R) return 'glassesRight'
  if (source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L) return 'glassesLeft'
  return 'unknown'
}

export function normalizeHardwareInput(event: EvenHubEvent): NormalizedHardwareInput {
  const reportedSource = sourceOf(event)
  return {
    gesture: normalizeGesture(eventTypeOf(event)),
    source: normalizeSource(reportedSource),
    reportedSource,
  }
}

/** Maps device input to intent; HUD state and rendering never inspect hardware source. */
export function resolveSemanticAction(
  input: NormalizedHardwareInput,
  mode: HudMode,
): SemanticAction | null {
  if (
    input.gesture === 'doubleClick' ||
    input.gesture === 'systemExit' ||
    input.gesture === 'abnormalExit'
  ) {
    return 'exit'
  }

  if (input.gesture === 'click') return 'reveal'

  if (input.source === 'ring' && mode === 'LANGUAGE') {
    if (input.gesture === 'swipeUp') return 'previousItem'
    if (input.gesture === 'swipeDown') return 'nextItem'
  }

  // Glasses and source-less simulator events retain global HUD navigation.
  if (input.gesture === 'swipeUp') return 'previousMode'
  if (input.gesture === 'swipeDown') return 'nextMode'

  return null
}
