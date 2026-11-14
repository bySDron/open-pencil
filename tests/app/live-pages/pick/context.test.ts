import { beforeEach, expect, test } from 'bun:test'

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

beforeEach(() => {
  clearPick()
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
})
