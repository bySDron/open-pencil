import type { Vector } from '@open-pencil/scene-graph/primitives'

/**
 * What the pointer is over, in the pages the canvas draws.
 *
 * A screen a person is working on takes no pointer at all: the canvas keeps it, so the wheel zooms
 * and a drag moves the frame the way they always do. What is under the pointer inside the page is
 * therefore worked out here, from the box the page is drawn in, and sent to the page as a place -
 * a page is another document, and a place is the only thing that can be handed to it.
 */

/** A page under the pointer, and the place in it the pointer names. */
export type PageHit = { nodeId: string; x: number; y: number }

/** The box a page is drawn in, as the page layer draws it. */
const FRAME_BOX = '[data-frame-id]'

/**
 * The page under a point of the window, or null where there is none. The box is drawn at the
 * canvas's own zoom, so the place inside the page is the point measured back down to it.
 */
export function pageUnderPointer(event: MouseEvent): PageHit | null {
  for (const element of document.querySelectorAll<HTMLElement>(FRAME_BOX)) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    if (event.clientX < rect.left || event.clientX > rect.right) continue
    if (event.clientY < rect.top || event.clientY > rect.bottom) continue
    const nodeId = element.dataset.frameId
    if (nodeId === undefined) continue
    const zoom = rect.width / (Number.parseFloat(element.style.width) || rect.width)
    if (zoom <= 0) continue
    const point: Vector = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom
    }
    return { nodeId, x: point.x, y: point.y }
  }
  return null
}
