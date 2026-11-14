import { expect, test } from 'bun:test'

import { asDouble } from '@open-pencil/test-support/doubles'

import {
  clearPick,
  isPicking,
  pickedElement,
  pickedStyles,
  pickElement,
  resetPickedStyles,
  setPickedStyle,
  startPicking,
  stopPicking,
  useLivePick,
  writtenStyles
} from '@/app/live-pages/pick'

/** What one fake element keeps of the values written onto it. */
type FakeWritten = { written: Map<string, string> }

/** One element of a fake page, with the styles the page computes and the ones written onto it. */
function element() {
  const written = new Map<string, string>()
  const computed: Record<string, string> = { width: '120px', color: 'rgb(0, 0, 0)' }
  const node = {
    tagName: 'BUTTON',
    id: '',
    classList: ['button'],
    textContent: 'Save',
    style: {
      setProperty: (key: string, value: string) => written.set(key, value),
      removeProperty: (key: string) => written.delete(key)
    },
    written,
    getBoundingClientRect: () => asDouble<DOMRect>({ x: 4, y: 8, width: 120, height: 40 }),
    ownerDocument: {
      defaultView: {
        getComputedStyle: (target: FakeWritten) =>
          asDouble<CSSStyleDeclaration>({
            getPropertyValue: (key: string) => target.written.get(key) ?? computed[key] ?? ''
          })
      }
    }
  }
  return node
}

/** The element as the picker takes it, which is the one shape a fake cannot spell out. */
function asElement(node: ReturnType<typeof element>): Element {
  return asDouble<Element>(node)
}

test('a pick describes the element and the values it has now', () => {
  const picked = pickElement('frame-a', asElement(element()))

  expect(picked.nodeId).toBe('frame-a')
  expect(pickedElement.value?.info.tag).toBe('button')
  expect(pickedElement.value?.rect).toEqual({ x: 4, y: 8, width: 120, height: 40 })
  expect(pickedStyles.value?.width).toBe('120px')
  expect(writtenStyles.value).toEqual({})
})

test('a pick ends the mode it was made in, so a second press picks again', () => {
  startPicking()
  expect(isPicking.value).toBe(true)

  pickElement('frame-a', asElement(element()))

  expect(isPicking.value).toBe(false)
})

test('a value written in the panel is what the page shows afterwards', () => {
  const button = element()
  pickElement('frame-a', asElement(button))

  setPickedStyle('color', 'rgb(255, 0, 0)')

  expect(button.written.get('color')).toBe('rgb(255, 0, 0)')
  expect(pickedStyles.value?.color).toBe('rgb(255, 0, 0)')
  expect(writtenStyles.value).toEqual({ color: 'rgb(255, 0, 0)' })
})

test('taking a change back leaves the page its own styles', () => {
  const button = element()
  pickElement('frame-a', asElement(button))
  setPickedStyle('color', 'rgb(255, 0, 0)')

  resetPickedStyles()

  expect(button.written.size).toBe(0)
  expect(pickedStyles.value?.color).toBe('rgb(0, 0, 0)')
  expect(writtenStyles.value).toEqual({})
  // The element stays picked: only what this app wrote is taken back.
  expect(pickedElement.value).not.toBeNull()
})

test('clearing the pick takes every written value with it', () => {
  const button = element()
  pickElement('frame-a', asElement(button))
  setPickedStyle('width', '200px')

  clearPick()

  expect(pickedElement.value).toBeNull()
  expect(pickedStyles.value).toBeNull()
  expect(button.written.size).toBe(0)
})

test('the panel and the canvas read one pick, and it can be left', () => {
  const pick = useLivePick()
  startPicking()
  expect(pick.picking.value).toBe(true)

  stopPicking()

  expect(pick.picking.value).toBe(false)
})
