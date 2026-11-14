import { ref } from 'vue'

import type { InspectRequest, PageNode } from './inspect-protocol'
import { inspectRequest } from './inspect-protocol'

/**
 * The app's side of the inspector: the frames that run it, the trees they answer with, and the
 * requests sent to them.
 *
 * A live page is another origin, so nothing here touches a document. A frame registers the window
 * it draws, requests travel as `postMessage`, and the answers come back through the canvas layer
 * that already listens for a page's own messages.
 */

/** The window each frame draws, by the frame it belongs to. */
const frames = new Map<string, Window>()

/** The elements of each page, as the page last described them, by frame. */
const trees = ref<Record<string, PageNode[]>>({})

/** A frame announces the window it draws, or null when the page is gone. */
export function registerPageFrame(nodeId: string, window: Window | null): void {
  if (window === null) frames.delete(nodeId)
  else frames.set(nodeId, window)
}

/** What the page answered, or null when no frame holds it. */
export function pageFrame(nodeId: string): Window | null {
  return frames.get(nodeId) ?? null
}

/** Ask one frame's page for something; a frame whose page is gone answers nothing. */
export function sendToPage(nodeId: string, request: InspectRequest): boolean {
  const target = frames.get(nodeId)
  if (target === undefined || target.closed) return false
  try {
    target.postMessage(JSON.parse(inspectRequest(request)), '*')
    return true
  } catch {
    // A page that has navigated somewhere else is no longer one of ours.
    frames.delete(nodeId)
    return false
  }
}

/** The pages on the canvas, by the frame each belongs to. */
export function pageTrees(): Record<string, PageNode[]> {
  return trees.value
}

/** Keep the tree a page answered with. */
export function setPageTree(nodeId: string, nodes: PageNode[]): void {
  trees.value = { ...trees.value, [nodeId]: nodes }
}

/** Forget the tree of a frame that no longer shows a page. */
export function clearPageTree(nodeId: string): void {
  if (!(nodeId in trees.value)) return
  const next: Record<string, PageNode[]> = {}
  for (const [key, nodes] of Object.entries(trees.value)) {
    if (key !== nodeId) next[key] = nodes
  }
  trees.value = next
}

/** Ask a page for its elements, which is what the layers panel shows beside the canvas. */
export function requestPageTree(nodeId: string): void {
  sendToPage(nodeId, { type: 'tree' })
}
