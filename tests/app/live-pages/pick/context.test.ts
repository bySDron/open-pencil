import { beforeEach, expect, test } from 'bun:test'

import { asDouble } from '@open-pencil/test-support/doubles'

import { registerPageFrame } from '@/app/live-pages/inspect/bridge'
import type { PageNode } from '@/app/live-pages/inspect/protocol'
import { clearPick, pickFromPage, setPickedStyle } from '@/app/live-pages/pick'
import { changedValues, pickedScreenElement } from '@/app/live-pages/pick/context'

const node: PageNode = {
  id: '2',
  parentId: null,
  depth: 1,
  tag: 'button',
  classes: ['rp-button', 'wide'],
  text: 'Save',
  rect: { x: 4, y: 8, width: 120, height: 40 },
  component: { name: 'SaveButton', file: '/app/components/SaveButton.vue' }
}

/** A frame that still draws a page, keeping what the panel sends it. */
function liveFrame(nodeId: string): unknown[] {
  const sent: unknown[] = []
  const frame = {
    closed: false,
    postMessage: (message: unknown) => sent.push(message)
  }
  registerPageFrame(nodeId, asDouble<Window>(frame))
  return sent
}

let sent: unknown[] = []

beforeEach(() => {
  clearPick()
  sent = liveFrame('frame-a')
})

test('nothing picked is nothing a request carries', () => {
  expect(pickedScreenElement()).toBeNull()
  expect(changedValues()).toBe('')
})

test('a picked element is named by its selector and the component that rendered it', () => {
  pickFromPage('frame-a', { node, styles: {} })

  expect(pickedScreenElement()).toEqual({
    selector: 'button.rp-button.wide',
    componentFile: '/app/components/SaveButton.vue',
    changed: ''
  })
})

test('the values the panel changed on it travel with it, in the order they were written', () => {
  pickFromPage('frame-a', { node, styles: {} })

  setPickedStyle('padding', '4px 8px')
  setPickedStyle('color', 'rgb(255, 0, 0)')

  expect(pickedScreenElement()?.changed).toBe('padding: 4px 8px; color: rgb(255, 0, 0)')
  // The page is the one that shows the change, so it is the one asked to make it.
  expect(sent).toHaveLength(2)
  expect(JSON.stringify(sent)).toContain('"key":"color"')
})

test('a value taken back is no longer one of the changes', () => {
  pickFromPage('frame-a', { node, styles: {} })
  setPickedStyle('color', 'rgb(255, 0, 0)')

  setPickedStyle('color', '')

  expect(pickedScreenElement()?.changed).toBe('')
})

test('a page that is gone is not reported as changed', () => {
  pickFromPage('frame-a', { node, styles: {} })
  registerPageFrame('frame-a', null)

  setPickedStyle('color', 'rgb(255, 0, 0)')

  expect(pickedScreenElement()?.changed).toBe('')
  expect(sent).toHaveLength(0)
})
