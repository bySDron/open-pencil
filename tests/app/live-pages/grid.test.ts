import { expect, test } from 'bun:test'

import {
  layoutGroups,
  PAGE_COLUMNS,
  PAGE_GAP,
  SECTION_GAP,
  SECTION_PADDING
} from '@/app/live-pages/grid'

const page = { width: 1440, height: 900 }

test('a section spans the grid of its pages and leaves room for its title', () => {
  const [layout] = layoutGroups([{ items: ['a', 'b', 'c', 'd'] }], page)

  expect(layout?.section).toEqual({
    x: 0,
    y: 0,
    width: PAGE_COLUMNS * (page.width + PAGE_GAP) - PAGE_GAP + SECTION_PADDING * 2,
    height: 2 * (page.height + PAGE_GAP) - PAGE_GAP + SECTION_PADDING * 2
  })
})

test('pages fill a row left to right inside the section, and the rows go down', () => {
  const [layout] = layoutGroups([{ items: ['a', 'b', 'c', 'd'] }], page)

  expect(layout?.pages.map((placed) => placed.at)).toEqual([
    { x: SECTION_PADDING, y: SECTION_PADDING },
    { x: SECTION_PADDING + page.width + PAGE_GAP, y: SECTION_PADDING },
    { x: SECTION_PADDING + 2 * (page.width + PAGE_GAP), y: SECTION_PADDING },
    { x: SECTION_PADDING, y: SECTION_PADDING + page.height + PAGE_GAP }
  ])
})

test('the next section starts under the one before it, with room between', () => {
  const [first, second] = layoutGroups([{ items: ['a'] }, { items: ['b'] }], page)
  expect(second?.section.y).toBe(
    (first?.section.y ?? 0) + (first?.section.height ?? 0) + SECTION_GAP
  )
})

test('a section as wide as the pages it holds, not as wide as a full row', () => {
  const [layout] = layoutGroups([{ items: ['only'] }], page)
  expect(layout?.section.width).toBe(page.width + SECTION_PADDING * 2)
})

test('a group with nothing in it takes no section', () => {
  expect(layoutGroups([{ items: [] }], page)).toEqual([])
})
