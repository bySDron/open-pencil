import { expect, test } from 'bun:test'

import type { Rect } from '@open-pencil/scene-graph/primitives'
import { asDouble } from '@open-pencil/test-support/doubles'

import {
  applyStyle,
  clearStyles,
  describeElement,
  documentOf,
  elementAt,
  readStyles,
  rectOf,
  selectorOf,
  type LiveStyleKey
} from '@/app/live-pages/inspect'

/** The style values the fake page computes, before anything is written onto the element. */
const COMPUTED: Record<string, string> = {
  display: 'flex',
  width: '320px',
  height: '48px',
  gap: '8px',
  padding: '12px 16px',
  'font-size': '14px',
  'font-weight': '600',
  'line-height': '20px',
  color: 'rgb(17, 24, 39)',
  'background-color': 'rgb(37, 99, 235)',
  'border-radius': '8px',
  'border-width': '0px',
  'border-color': 'rgb(0, 0, 0)',
  opacity: '1'
}

/** What one fake element keeps of the values written onto it. */
type FakeWritten = { written: Map<string, string> }

/** One element of a fake page: what a panel reads and what it can write. */
function fakeElement(
  options: {
    tag?: string
    id?: string
    classes?: string[]
    text?: string
    rect?: Rect
    /** The Vue instance chain the element was rendered by, as a development build exposes it. */
    instance?: unknown
  } = {}
) {
  const written = new Map<string, string>()
  const element = {
    tagName: (options.tag ?? 'button').toUpperCase(),
    id: options.id ?? '',
    classList: options.classes ?? ['rp-button', 'rp-button--primary', 'wide', 'extra'],
    textContent: options.text ?? '  Save   changes ',
    style: {
      setProperty: (key: string, value: string) => written.set(key, value),
      removeProperty: (key: string) => written.delete(key)
    },
    written,
    getBoundingClientRect: () =>
      asDouble<DOMRect>(options.rect ?? { x: 10, y: 20, width: 120, height: 40 }),
    ownerDocument: {
      defaultView: {
        getComputedStyle: (target: FakeWritten) =>
          asDouble<CSSStyleDeclaration>({
            getPropertyValue: (key: string) => target.written.get(key) ?? COMPUTED[key] ?? ''
          })
      }
    },
    __vueParentComponent: options.instance
  }
  return element
}

/** The element as the inspector takes it, which is the one shape a fake cannot spell out. */
function asElement(element: ReturnType<typeof fakeElement>): Element {
  return asDouble<Element>(element)
}

test('an element is named by its tag, its classes, its words, and who rendered it', () => {
  const element = fakeElement({
    id: 'submit',
    instance: {
      type: { __name: 'SaveButton', __file: '/app/components/SaveButton.vue' },
      parent: null
    }
  })

  const info = describeElement(asElement(element))

  expect(info.tag).toBe('button')
  expect(info.id).toBe('submit')
  // A row has room for a few classes; the rest would push the name off it.
  expect(info.classes).toEqual(['rp-button', 'rp-button--primary', 'wide'])
  expect(info.text).toBe('Save changes')
  expect(info.component).toEqual({ name: 'SaveButton', file: '/app/components/SaveButton.vue' })
  expect(selectorOf(info)).toBe('#submit')
})

test('an element with no name of its own is found by its tag and classes', () => {
  const info = describeElement(asElement(fakeElement()))

  expect(selectorOf(info)).toBe('button.rp-button.rp-button--primary.wide')
})

test('a component is found up the tree the element was rendered by', () => {
  const element = fakeElement({
    instance: {
      type: { __file: '/app/pages/pricing.vue' },
      parent: {
        type: { __name: 'PriceCard', __file: '/app/components/PriceCard.vue' },
        parent: null
      }
    }
  })

  const info = describeElement(asElement(element))

  // The nearest component that names its file wins; a file without a name is named by the file.
  expect(info.component).toEqual({ name: 'pricing.vue', file: '/app/pages/pricing.vue' })
})

test('a page built for production has no component to report', () => {
  expect(describeElement(asElement(fakeElement())).component).toBeNull()
})

test('the values a panel shows are the ones the page computes', () => {
  const styles = readStyles(asElement(fakeElement()))

  expect(styles.width).toBe('320px')
  expect(styles['background-color']).toBe('rgb(37, 99, 235)')
  expect(Object.keys(styles)).toContain('opacity')
})

test('a written value is what the page has afterwards', () => {
  const element = asElement(fakeElement())

  applyStyle(element, 'padding', '4px 8px')

  expect(readStyles(element).padding).toBe('4px 8px')
})

test('a value taken back leaves the page its own style', () => {
  const element = asElement(fakeElement())
  applyStyle(element, 'color', 'rgb(255, 0, 0)')

  clearStyles(element, ['color', 'padding'])

  expect(readStyles(element).color).toBe('rgb(17, 24, 39)')
})

test('a value the person emptied is removed rather than written empty', () => {
  const element = fakeElement()

  applyStyle(asElement(element), 'gap', '   ')

  expect(element.written.has('gap')).toBe(false)
})

test('the point under the pointer picks the element the page laid out there', () => {
  const hit = fakeElement()
  const doc = {
    body: { tagName: 'BODY' },
    documentElement: { tagName: 'HTML' },
    elementFromPoint: (x: number, y: number) => (x === 5 && y === 6 ? hit : null)
  }

  expect(elementAt(asDouble<Document>(doc), 5, 6)).toBe(asElement(hit))
  // Empty space of a page is not something a person means to select.
  expect(elementAt(asDouble<Document>(doc), 1, 1)).toBeNull()
})

test('a frame whose document the window refuses answers nothing', () => {
  const frame = {
    get contentDocument(): Document {
      throw new Error('Blocked a frame with origin from accessing a cross-origin frame')
    }
  }

  expect(documentOf(asDouble<HTMLIFrameElement>(frame))).toBeNull()
  expect(documentOf(null)).toBeNull()
})

test('the box drawn over a page is the element’s own rectangle', () => {
  const element = fakeElement({ rect: { x: 10, y: 20, width: 120, height: 40 } })

  expect(rectOf(asElement(element))).toEqual({ x: 10, y: 20, width: 120, height: 40 })
})

test('a value is written under the property the page knows it by', () => {
  const element = fakeElement()
  const key: LiveStyleKey = 'background-color'

  applyStyle(asElement(element), key, '#fff')

  expect([...element.written.keys()]).toEqual(['background-color'])
})
