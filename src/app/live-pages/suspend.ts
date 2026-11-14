import { ref } from 'vue'

/**
 * Pages that are stepped out of the way while their own layer is being moved.
 *
 * The canvas draws a layer where a drag has taken it without touching the scene: the graph keeps the
 * place the move began at, and only the drop writes the new one. A page cannot follow a place that
 * is not written anywhere, so it is hidden for the length of the gesture - the frame's own outline
 * and fill show the move, and the page reappears at the new place as soon as the move is committed.
 */
const suspended = ref(new Set<string>())

/** Whether this page is standing aside while its layer is moved. */
export function isSuspended(nodeId: string): boolean {
  return suspended.value.has(nodeId)
}

/** Step a page out of the way for the length of a gesture. */
export function suspendPage(nodeId: string): void {
  if (suspended.value.has(nodeId)) return
  const next = new Set(suspended.value)
  next.add(nodeId)
  suspended.value = next
}

/** Put every page back, which is what the end of a gesture does. */
export function resumePages(): void {
  if (suspended.value.size === 0) return
  suspended.value = new Set()
}
