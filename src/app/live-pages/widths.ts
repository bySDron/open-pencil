import type { Editor } from '@open-pencil/core'

/**
 * The widths a screen is looked at, and the frame that shows it at one of them.
 *
 * A live page fills its frame, and a frame's width is the page's viewport: choosing a width here is
 * the page's own responsive layout doing the work, not a scaled picture of it.
 */

/** The widths a person picks between: a desktop screen, a tablet, and a phone. */
export const SCREEN_WIDTHS = [1440, 768, 390] as const

export type ScreenWidth = (typeof SCREEN_WIDTHS)[number]

/** What a width is called, which is the name of the device it belongs to. */
export type ScreenWidthKind = 'desktop' | 'tablet' | 'phone'

/** The name of a width: the nearest one a person picks between. */
export function widthKind(width: number): ScreenWidthKind {
  const nearest = nearestScreenWidth(width)
  if (nearest === 390) return 'phone'
  return nearest === 768 ? 'tablet' : 'desktop'
}

/** The width a person picked that a frame's own width is closest to. */
export function nearestScreenWidth(width: number): ScreenWidth {
  let best: ScreenWidth = SCREEN_WIDTHS[0]
  for (const candidate of SCREEN_WIDTHS) {
    if (Math.abs(candidate - width) < Math.abs(best - width)) best = candidate
  }
  return best
}

/** What resizing a screen needs: its graph, and an edit that can be undone like any other. */
export type ScreenResizer = Pick<Editor, 'updateNodeWithUndo'>

/**
 * Show a frame's page at a width, as one undoable edit. The frame keeps its place and its height:
 * a taller phone screen is the page's own scroll, not something this edit decides.
 */
export function resizeScreen(resizer: ScreenResizer, nodeId: string, width: ScreenWidth): void {
  resizer.updateNodeWithUndo(nodeId, { width }, 'Resize screen')
}
