import { ref, shallowRef } from 'vue'

import {
  applyStyle,
  clearStyles,
  describeElement,
  documentOf,
  readStyles,
  rectOf,
  type LiveElementInfo,
  type LiveRect,
  type LiveStyleKey
} from './inspect'

/**
 * The element of a live page a person picked, and the values they changed on it. It is kept outside
 * the components that draw it, because the page, the canvas, and the properties panel are three
 * parts of one application: a pick made in the page is what the panel shows and what the canvas
 * outlines.
 */
export type PickedElement = {
  /** The frame whose page the element belongs to. */
  nodeId: string
  element: Element
  info: LiveElementInfo
  rect: LiveRect
}

const picked = shallowRef<PickedElement | null>(null)
const styles = ref<Record<LiveStyleKey, string> | null>(null)
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

/**
 * Take the next click on a live page as a pick, when the window lets this app read the page it
 * shows. Answers whether picking started, so the panel can say why a click would do nothing.
 */
export function tryStartPicking(): boolean {
  if (typeof document === 'undefined') return false
  const frame = document.querySelector<HTMLIFrameElement>('[data-test-id="live-page-iframe"]')
  if (frame === null || documentOf(frame) === null) return false
  startPicking()
  return true
}

export function stopPicking(): void {
  picking.value = false
}

/** What the element under the pointer is right now, for the box drawn over the page. */
export function highlightOf(element: Element | null): LiveRect | null {
  return element === null ? null : rectOf(element)
}

function refresh(element: Element): void {
  styles.value = readStyles(element)
  const current = picked.value
  if (current !== null) picked.value = { ...current, rect: rectOf(element) }
}

/**
 * Pick one element of a frame's page. A pick ends the picking mode, so a second press is another
 * pick rather than every click of the canvas changing the panel.
 */
export function pickElement(nodeId: string, element: Element): PickedElement {
  const next: PickedElement = {
    nodeId,
    element,
    info: describeElement(element),
    rect: rectOf(element)
  }
  picked.value = next
  written.value = {}
  refresh(element)
  stopPicking()
  return next
}

/** Forget the picked element, leaving the page exactly as its own code draws it. */
export function clearPick(): void {
  const current = picked.value
  if (current !== null) clearStyles(current.element, Object.keys(written.value) as LiveStyleKey[])
  picked.value = null
  styles.value = null
  written.value = {}
}

/** Write one value onto the picked element, which the page shows at once. */
export function setPickedStyle(key: LiveStyleKey, value: string): void {
  const current = picked.value
  if (current === null) return
  applyStyle(current.element, key, value)
  written.value = { ...written.value, [key]: value }
  refresh(current.element)
}

/** Take back every value this app wrote, leaving the page's own styles in place. */
export function resetPickedStyles(): void {
  const current = picked.value
  if (current === null) return
  clearStyles(current.element, Object.keys(written.value) as LiveStyleKey[])
  written.value = {}
  refresh(current.element)
}

/** The picked element as the properties panel and the canvas read it. */
export function useLivePick() {
  return {
    picked,
    styles,
    written,
    picking,
    startPicking,
    tryStartPicking,
    stopPicking,
    pickElement,
    clearPick,
    setPickedStyle,
    resetPickedStyles
  }
}
