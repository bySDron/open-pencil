import type { Rect, Vector } from '@open-pencil/scene-graph/primitives'

/** How many pages one row of a section holds. */
export const PAGE_COLUMNS = 3
/** Room between two pages, so their frames never touch. */
export const PAGE_GAP = 80
/** Room a section leaves around the pages it holds, and above them for its title. */
export const SECTION_PADDING = 48
/** Room between two sections, so a title never reads as part of the section before it. */
export const SECTION_GAP = 240

/** The box a section takes on the page, its title included. */
export type SectionBox = Rect

/** A section and the pages laid inside it, each beside the thing the caller laid out. */
export type GroupLayout<T> = {
  section: SectionBox
  pages: { item: T; at: Vector }[]
}

/**
 * Sections one under another down the page: each group takes a section sized to the grid of its
 * pages, and the next group starts below it. A page is placed from its section's corner, since a
 * section holds its layers in its own space (`getAbsolutePosition` adds the section back), so `at`
 * is a point inside `section`, not on the page. A group with nothing in it takes no section, and
 * the ones after it close the gap.
 */
export function layoutGroups<T>(
  groups: readonly { items: readonly T[] }[],
  page: { width: number; height: number },
  /** Where the content starts, which is below whatever the canvas already holds. */
  origin: Vector = { x: 0, y: 0 }
): GroupLayout<T>[] {
  const layouts: GroupLayout<T>[] = []
  let top = origin.y
  for (const group of groups) {
    if (group.items.length === 0) continue
    const columns = Math.min(group.items.length, PAGE_COLUMNS)
    const rows = Math.ceil(group.items.length / PAGE_COLUMNS)
    const width = columns * (page.width + PAGE_GAP) - PAGE_GAP + SECTION_PADDING * 2
    const height = rows * (page.height + PAGE_GAP) - PAGE_GAP + SECTION_PADDING * 2
    const section: SectionBox = { x: origin.x, y: top, width, height }
    const pages = group.items.map((item, index) => ({
      item,
      at: {
        x: SECTION_PADDING + (index % PAGE_COLUMNS) * (page.width + PAGE_GAP),
        y: SECTION_PADDING + Math.floor(index / PAGE_COLUMNS) * (page.height + PAGE_GAP)
      }
    }))
    layouts.push({ section, pages })
    top += height + SECTION_GAP
  }
  return layouts
}
