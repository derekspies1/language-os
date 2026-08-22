import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EventSourceType,
  OsEventTypeList,
  Sys_ItemEvent,
  Text_ItemEvent,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { normalizeHardwareInput, resolveSemanticAction } from '../src/input-policy'

function event(eventType: OsEventTypeList, eventSource?: EventSourceType): EvenHubEvent {
  return { sysEvent: new Sys_ItemEvent({ eventType, ...(eventSource === undefined ? {} : { eventSource }) }) }
}

test('R1 gestures map to item-level Language actions', () => {
  const ring = EventSourceType.TOUCH_EVENT_FROM_RING
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.CLICK_EVENT, ring)), 'LANGUAGE'), 'reveal')
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.SCROLL_TOP_EVENT, ring)), 'LANGUAGE'), 'previousItem')
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.SCROLL_BOTTOM_EVENT, ring)), 'LANGUAGE'), 'nextItem')
})

test('glasses retain reveal and global mode navigation', () => {
  const glasses = EventSourceType.TOUCH_EVENT_FROM_GLASSES_R
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.CLICK_EVENT, glasses)), 'LANGUAGE'), 'reveal')
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.SCROLL_TOP_EVENT, glasses)), 'LANGUAGE'), 'previousMode')
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(OsEventTypeList.SCROLL_BOTTOM_EVENT, glasses)), 'LANGUAGE'), 'nextMode')
})

test('source-less simulator input follows glasses fallback policy', () => {
  const input = normalizeHardwareInput({
    textEvent: new Text_ItemEvent({ eventType: OsEventTypeList.SCROLL_TOP_EVENT }),
  })
  assert.equal(input.source, 'unknown')
  assert.equal(resolveSemanticAction(input, 'LANGUAGE'), 'previousMode')
})

test('current source-only simulator click shape is normalized as reveal', () => {
  const input = normalizeHardwareInput({
    sysEvent: new Sys_ItemEvent({ eventSource: EventSourceType.TOUCH_EVENT_FROM_GLASSES_R }),
  })
  assert.equal(input.gesture, 'click')
  assert.equal(input.source, 'glassesRight')
  assert.equal(resolveSemanticAction(input, 'LANGUAGE'), 'reveal')
})

test('ring swipes outside Language mode remain global navigation', () => {
  const input = normalizeHardwareInput(event(
    OsEventTypeList.SCROLL_BOTTOM_EVENT,
    EventSourceType.TOUCH_EVENT_FROM_RING,
  ))
  assert.equal(resolveSemanticAction(input, 'FOCUS'), 'nextMode')
})

test('double click and host exit events map to exit for every source', () => {
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(
    OsEventTypeList.DOUBLE_CLICK_EVENT,
    EventSourceType.TOUCH_EVENT_FROM_RING,
  )), 'LANGUAGE'), 'exit')
  assert.equal(resolveSemanticAction(normalizeHardwareInput(event(
    OsEventTypeList.SYSTEM_EXIT_EVENT,
  )), 'LANGUAGE'), 'exit')
})
