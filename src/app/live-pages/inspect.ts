/**
 * Reading and changing one element of a page the application runs.
 *
 * A live page is a frame of the dev server, so the only way to know what a person is looking at is
 * to read the page's own document. The desktop window is built so that document is readable, and a
 * browser build answers `null` instead of failing: the panel then says the page cannot be inspected
 * rather than offering controls that would do nothing.
 */

import type { Rect } from '@open-pencil/scene-graph/primitives'

/** What a picked element is, in the words the properties panel names it by. */
export type LiveElementInfo = {
  tag: string
  id: string
  classes: string[]
  /** The element's own text, cut to what a panel row can show. */
  text: string
  /** The Vue component that rendered it, from the development build's own `__file`. */
  component: { name: string; file: string } | null
}

/** A rectangle in the page's own pixels, which the frame draws at its own size. */
export type LiveRect = Rect

/** The longest run of an element's text the panel shows. */
const TEXT_LIMIT = 80

/** How many of an element's classes are named before the rest are dropped. */
const CLASS_LIMIT = 3

/** The one style value a picked element is described by, and the CSS property it writes. */
export type LiveStyleKey =
  | 'display'
  | 'width'
  | 'height'
  | 'gap'
  | 'padding'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'color'
  | 'background-color'
  | 'border-radius'
  | 'border-width'
  | 'border-color'
  | 'opacity'

/** The style values the panel reads, in the order its rows show them. */
export const LIVE_STYLE_KEYS: readonly LiveStyleKey[] = [
  'display',
  'width',
  'height',
  'gap',
  'padding',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
  'border-width',
  'border-color',
  'opacity'
]

/** The document a live frame draws, or null when the window refuses to hand it over. */
export function documentOf(frame: HTMLIFrameElement | null): Document | null {
  if (frame === null) return null
  try {
    return frame.contentDocument
  } catch (error) {
    // A build that keeps the frame to itself answers here instead of on every later read.
    void error
    return null
  }
}

/**
 * The element under a point of the page: the deepest box the layout put there. A page's own body
 * and root are not elements a person means to select, so a click on empty space picks nothing.
 */
export function elementAt(doc: Document, x: number, y: number): Element | null {
  let hit: Element | null
  try {
    hit = doc.elementFromPoint(x, y)
  } catch (error) {
    void error
    return null
  }
  if (hit === null || hit === doc.body || hit === doc.documentElement) return null
  return hit
}

/** The rectangle an element takes in the page, which is what the canvas draws a box around. */
export function rectOf(element: Element): LiveRect {
  const box = element.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

/** The Vue component an element was rendered by, when the page runs a development build. */
export function componentOf(element: Element): { name: string; file: string } | null {
  type Component = { __name?: string; __file?: string }
  type Instance = { type?: Component; parent?: Instance | null }
  const scope = element as Element & { __vueParentComponent?: Instance }
  let instance = scope.__vueParentComponent
  while (instance) {
    const file = instance.type?.__file
    const name = instance.type?.__name ?? ''
    if (typeof file === 'string' && file !== '') {
      return { name: name === '' ? fileName(file) : name, file }
    }
    instance = instance.parent ?? undefined
  }
  return null
}

/** The last segment of a path, which names a component whose own name it does not carry. */
function fileName(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments.at(-1) ?? path
}

/** What a picked element is: its tag, its name, its classes, its words, and who rendered it. */
export function describeElement(element: Element): LiveElementInfo {
  const classes = [...element.classList]
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id,
    classes: classes.slice(0, CLASS_LIMIT),
    text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, TEXT_LIMIT),
    component: componentOf(element)
  }
}

/** The style values an element currently has, as the page itself computed them. */
export function readStyles(element: Element): Record<LiveStyleKey, string> {
  const view = element.ownerDocument.defaultView
  if (view === null)
    return Object.fromEntries(LIVE_STYLE_KEYS.map((key) => [key, ''])) as Record<
      LiveStyleKey,
      string
    >
  const computed = view.getComputedStyle(element)
  return Object.fromEntries(
    LIVE_STYLE_KEYS.map((key) => [key, computed.getPropertyValue(key).trim()])
  ) as Record<LiveStyleKey, string>
}

/** Write one value onto the element itself, which the page shows at once. */
export function applyStyle(element: Element, key: LiveStyleKey, value: string): void {
  const target = element as HTMLElement
  const trimmed = value.trim()
  if (trimmed === '') target.style.removeProperty(key)
  else target.style.setProperty(key, trimmed)
}

/** Take every value the panel wrote back off the element, leaving the page's own styles. */
export function clearStyles(element: Element, keys: readonly LiveStyleKey[]): void {
  for (const key of keys) (element as HTMLElement).style.removeProperty(key)
}

/** A selector a person can paste into the page's own dev tools to find the element again. */
export function selectorOf(info: LiveElementInfo): string {
  if (info.id !== '') return `#${info.id}`
  const classes = info.classes.map((name) => `.${name}`).join('')
  return `${info.tag}${classes}`
}
