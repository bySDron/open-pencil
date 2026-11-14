import type { Vector } from '@open-pencil/scene-graph/primitives'

/**
 * What a canvas of live screens costs.
 *
 * A page of the running application is a whole application: its scripts, its memory, its own frame
 * loop. A canvas that holds twenty of them and keeps every one running carries twenty applications,
 * which is what a person feels while panning and zooming. So a screen runs only while it is near the
 * view, and only the screens in the view are drawn as themselves - the rest show the picture the
 * list already keeps of them.
 */

/** A screen as the canvas layer places it, in the layer's own pixels. */
export type ScreenBox = {
  nodeId: string
  at: Vector
  width: number
  height: number
}

/** How far beyond the view a screen still counts as being looked at, in screen pixels. */
export const AWAKE_MARGIN = 400

/** How many screens around the view keep running. */
export const NEAR_SCREENS = 1

/** The screens of a canvas: the ones that run, and the ones drawn as themselves. */
export type ScreensInView = {
  running: ReadonlySet<string>
  shown: ReadonlySet<string>
}

/** The part of the canvas a person looks at, in the layer's own pixels. */
type Viewport = { width: number; height: number }

/** The canvas as it is panned and zoomed, which is where the view sits. */
type CanvasView = { panX: number; panY: number; zoom: number }

/** Where the view is in the layer's own pixels, or null while the canvas is not drawn yet. */
function windowOf(view: CanvasView, viewport: Viewport) {
  const { panX, panY, zoom } = view
  if (viewport.width <= 0 || viewport.height <= 0 || zoom <= 0) return null
  return {
    left: -panX / zoom,
    top: -panY / zoom,
    right: (viewport.width - panX) / zoom,
    bottom: (viewport.height - panY) / zoom
  }
}

/**
 * Which screens run, and which of them are drawn as themselves. A screen a scroll away keeps running
 * so coming back to it does not start it from nothing; a screen further than that is its picture.
 */
export function screensInView(
  screens: readonly ScreenBox[],
  view: CanvasView,
  viewport: Viewport
): ScreensInView {
  const running = new Set<string>()
  const shown = new Set<string>()
  const box = windowOf(view, viewport)
  if (box === null) return { running, shown }
  // Screens a whole screen away in every direction still run, which is two screens across.
  const aside = Math.max(box.right - box.left, box.bottom - box.top) * NEAR_SCREENS
  for (const screen of screens) {
    const right = screen.at.x + screen.width
    const bottom = screen.at.y + screen.height
    const near =
      right > box.left - aside &&
      screen.at.x < box.right + aside &&
      bottom > box.top - aside &&
      screen.at.y < box.bottom + aside
    if (!near) continue
    running.add(screen.nodeId)
    const onView =
      right > box.left - AWAKE_MARGIN &&
      screen.at.x < box.right + AWAKE_MARGIN &&
      bottom > box.top - AWAKE_MARGIN &&
      screen.at.y < box.bottom + AWAKE_MARGIN
    if (onView) shown.add(screen.nodeId)
  }
  return { running, shown }
}
