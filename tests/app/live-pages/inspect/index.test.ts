import { expect, test } from 'bun:test'

import { escapeName, pageNodeLabel, selectorOf } from '@/app/live-pages/inspect'
import type { PageNode } from '@/app/live-pages/inspect/protocol'

/**
 * The name an element is found by again.
 *
 * A page that reloaded is asked for its element by this name, so the name has to be one a browser
 * can actually read: the classes of a real application are full of characters - `md:flex`,
 * `w-1/2`, `2xl:grid` - that make a selector invalid as they stand, and a page throws on those.
 */

function node(overrides: Partial<PageNode> = {}): PageNode {
  return {
    id: '2',
    parentId: null,
    depth: 1,
    tag: 'button',
    classes: [],
    text: '',
    rect: { x: 0, y: 0, width: 10, height: 10 },
    component: null,
    ...overrides
  }
}

test('an element with plain classes is named as it stands', () => {
  expect(selectorOf(node({ classes: ['rp-button', 'wide'] }))).toBe('button.rp-button.wide')
})

test('utility classes are escaped, since a selector cannot hold them as they are', () => {
  expect(selectorOf(node({ tag: 'div', classes: ['md:flex', 'w-1/2'] }))).toBe(
    'div.md\\:flex.w-1\\/2'
  )
})

test('a class that starts with a digit is spelled out by its code', () => {
  expect(selectorOf(node({ tag: 'div', classes: ['2xl:grid'] }))).toBe('div.\\32 xl\\:grid')
})

test('only the first classes are named, so a name stays one a person can read', () => {
  expect(selectorOf(node({ classes: ['a', 'b', 'c', 'd', 'e'] }))).toBe('button.a.b.c')
})

test('an element is labelled by the words it shows, or by its name when it shows none', () => {
  expect(pageNodeLabel(node({ text: 'Save' }))).toBe('Save')
  expect(pageNodeLabel(node({ classes: ['rp-button'] }))).toBe('button.rp-button')
})

test('a name keeps the characters a class may hold, and escapes the rest', () => {
  expect(escapeName('flex-col')).toBe('flex-col')
  expect(escapeName('[&>div]')).toBe('\\[\\&\\>div\\]')
})
