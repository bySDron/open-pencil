import { beforeEach, expect, test } from 'bun:test'

import { asDouble } from '@open-pencil/test-support/doubles'

import { registerPageFrame } from '@/app/live-pages/inspect-bridge'
import type { PageNode } from '@/app/live-pages/inspect-protocol'
import {
  clearPick,
  isPicking,
  pickedElement,
  pickedStyles,
  pickFromPage,
  resetPickedStyles,
  setPickedStyle,
  startPicking,
  stopPicking,
  stylesFromPage,
  writtenStyles
} from '@/app/live-pages/pick'

const node: PageNode = {
  id: '2',
  parentId: null,
  depth: 1,
  tag: 'button',
  classes: ['rp-button'],
  text: 'Save',
  rect: { x: 4, y: 8, width: 120, height: 40 },
  component: null
}

/** The window a frame draws, which is where every request is posted. */
function frame() {
  const sent: { source: string; type: string; [key: string]: unknown }[] = []
  const window = asDouble<Window>({
    closed: false,
    postMessage: (message: unknown) => {
      sent.push(message as { source: string; type: string })
    }
  })
  return { window, sent }
}

beforeEach(() => {
  clearPick()
  stopPicking()
})

test('an element the page picked is what the panel describes', () => {
  const picked = pickFromPage('frame-a', { node, styles: { 'font-size': '14px' } })

  expect(picked.nodeId).toBe('frame-a')
  expect(pickedElement.value?.node.tag).toBe('button')
  expect(pickedElement.value?.rect).toEqual({ x: 4, y: 8, width: 120, height: 40 })
  expect(pickedStyles.value?.['font-size']).toBe('14px')
  expect(writtenStyles.value).toEqual({})
})

test('a pick ends the mode it was made in', () => {
  startPicking()
  expect(isPicking.value).toBe(true)

  pickFromPage('frame-a', { node, styles: {} })

  expect(isPicking.value).toBe(false)
})

test('a value the panel writes is sent to the page that holds the element', () => {
  const { window, sent } = frame()
  registerPageFrame('frame-a', window)
  pickFromPage('frame-a', { node, styles: { color: 'rgb(0, 0, 0)' } })

  setPickedStyle('color', 'rgb(255, 0, 0)')

  expect(sent).toEqual([
    { source: 'open-pencil-host', type: 'style', key: 'color', value: 'rgb(255, 0, 0)' }
  ])
  expect(writtenStyles.value).toEqual({ color: 'rgb(255, 0, 0)' })
  // The read value is what the page last reported, not what was typed.
  expect(pickedStyles.value?.color).toBe('rgb(0, 0, 0)')
})

test('the page answers a change with the values it has now', () => {
  const { window } = frame()
  registerPageFrame('frame-a', window)
  pickFromPage('frame-a', { node, styles: { color: 'rgb(0, 0, 0)' } })

  stylesFromPage('frame-a', { color: 'rgb(255, 0, 0)' }, { x: 0, y: 0, width: 10, height: 10 })

  expect(pickedStyles.value?.color).toBe('rgb(255, 0, 0)')
  expect(pickedElement.value?.rect.width).toBe(10)
})

test('an answer from another page leaves this one alone', () => {
  pickFromPage('frame-a', { node, styles: { color: 'rgb(0, 0, 0)' } })

  stylesFromPage('frame-b', { color: 'rgb(9, 9, 9)' }, node.rect)

  expect(pickedStyles.value?.color).toBe('rgb(0, 0, 0)')
})

test('taking a change back asks the page to drop what this app wrote', () => {
  const { window, sent } = frame()
  registerPageFrame('frame-a', window)
  pickFromPage('frame-a', { node, styles: {} })
  setPickedStyle('width', '200px')

  resetPickedStyles()

  expect(sent.at(-1)).toEqual({ source: 'open-pencil-host', type: 'reset' })
  expect(writtenStyles.value).toEqual({})
  expect(pickedElement.value).not.toBeNull()
})

test('clearing the pick leaves the page as its own code draws it', () => {
  const { window, sent } = frame()
  registerPageFrame('frame-a', window)
  pickFromPage('frame-a', { node, styles: {} })

  clearPick()

  expect(sent.at(-1)).toEqual({ source: 'open-pencil-host', type: 'clear' })
  expect(pickedElement.value).toBeNull()
  expect(pickedStyles.value).toBeNull()
})

test('a frame whose page is gone takes no request and does not throw', () => {
  registerPageFrame('frame-gone', null)
  pickFromPage('frame-gone', { node, styles: {} })

  expect(() => setPickedStyle('padding', '4px')).not.toThrow()
})
