import type { Rect } from '@open-pencil/scene-graph/primitives'

import type { PageNode } from './inspect-protocol'

/**
 * Reading and changing one element of a page the application runs.
 *
 * A live page is served by the project's dev server, which is another origin: its document cannot
 * be read from here. The work therefore happens in the page, in a script the window injects into
 * every frame, and this module keeps only what both sides agree on - the style values a person can
 * change and the selector an element is named by.
 */

/** A rectangle in the page's own pixels, which the frame draws at its own size. */
export type LiveRect = Rect

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

/** How many of an element's classes are named before the rest are dropped. */
const CLASS_LIMIT = 3

/** A selector a person can paste into the page's own dev tools to find the element again. */
export function selectorOf(node: PageNode): string {
  const classes = node.classes
    .slice(0, CLASS_LIMIT)
    .map((name) => `.${name}`)
    .join('')
  return `${node.tag}${classes}`
}

/** The element's own name in a layer row: its selector, or the words it shows. */
export function pageNodeLabel(node: PageNode): string {
  return node.text === '' ? selectorOf(node) : node.text
}
