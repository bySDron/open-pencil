import { ref, shallowRef } from 'vue'

import { LIVE_STYLE_KEYS, type LiveRect, type LiveStyleKey } from '../inspect'
import { sendToPage } from '../inspect/bridge'
import type { PageNode, PagePick } from '../inspect/protocol'

/**
 * The element of a live page a person picked, and the values they changed on it.
 *
 * The element lives in the page, not here: this holds what the page reported and sends back what
 * the panel changes. It is kept outside the components that read it, because the page, the canvas,
 * and the properties panel are three parts of one application.
 */
export type PickedElement = {
  /** The frame whose page the element belongs to. */
  nodeId: string
  node: PageNode
  rect: LiveRect
}

const picked = shallowRef<PickedElement | null>(null)
const styles = ref<Record<string, string> | null>(null)
/** The values this app wrote onto the element, so they can be taken back off it. */
const written = ref<Partial<Record<LiveStyleKey, string>>>({})
const picking = ref(false)

/** Whether the next click on a live page picks an element instead of reaching the page. */
export const isPicking = picking

/** The element the panel shows, or null when nothing is picked. */
export const pickedElement = picked

/** The values the picked element has now, as the page computes them. */
export const pickedStyles = styles

/** The values this app wrote onto the picked element. */
export const writtenStyles = written

/** Take the next click on a live page as a pick. */
export function startPicking(): void {
  picking.value = true
}

export function stopPicking(): void {
  picking.value = false
}

/**
 * Take what a page reported as the picked element. A pick ends the picking mode, so a second press
 * is another pick rather than every click of the canvas changing the panel.
 */
export function pickFromPage(nodeId: string, pick: PagePick): PickedElement {
  const next: PickedElement = { nodeId, node: pick.node, rect: pick.node.rect }
  picked.value = next
  styles.value = pick.styles
  written.value = {}
  stopPicking()
  return next
}

/** The values a page reports after a change, which is what the panel shows next. */
export function stylesFromPage(nodeId: string, next: Record<string, string>, rect: LiveRect): void {
  if (picked.value === null || picked.value.nodeId !== nodeId) return
  styles.value = next
  picked.value = { ...picked.value, rect }
}

/** Forget the picked element, leaving the page exactly as its own code draws it. */
export function clearPick(): void {
  const current = picked.value
  if (current !== null) sendToPage(current.nodeId, { type: 'clear' })
  picked.value = null
  styles.value = null
  written.value = {}
}

/** The written values without one of them, since a value taken back is no longer written. */
function withoutKey(
  written: Partial<Record<LiveStyleKey, string>>,
  key: LiveStyleKey
): Partial<Record<LiveStyleKey, string>> {
  const next: Partial<Record<LiveStyleKey, string>> = {}
  for (const name of LIVE_STYLE_KEYS) {
    const value = written[name]
    if (name !== key && value !== undefined) next[name] = value
  }
  return next
}

/** Write one value onto the picked element, which the page shows at once. */
export function setPickedStyle(key: LiveStyleKey, value: string): void {
  const current = picked.value
  if (current === null) return
  // A page that is gone never saw the value, so the panel must not report it as one of its own.
  if (!sendToPage(current.nodeId, { type: 'style', key, value })) return
  written.value = value === '' ? withoutKey(written.value, key) : { ...written.value, [key]: value }
}

/** Take back every value this app wrote, leaving the page's own styles in place. */
export function resetPickedStyles(): void {
  const current = picked.value
  if (current === null) return
  if (!sendToPage(current.nodeId, { type: 'reset' })) return
  written.value = {}
}

/** The picked element as the properties panel and the canvas read it. */
export function useLivePick() {
  return {
    picked,
    styles,
    written,
    picking,
    startPicking,
    stopPicking,
    pickFromPage,
    stylesFromPage,
    clearPick,
    setPickedStyle,
    resetPickedStyles
  }
}
