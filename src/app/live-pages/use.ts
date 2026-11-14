import { computed, reactive, ref } from 'vue'

import type { SceneNode } from '@open-pencil/scene-graph'
import type { Vector } from '@open-pencil/scene-graph/primitives'

import { useEditorStore } from '@/app/editor/active-store'

import { pagePlacement } from './placement'
import {
  canShowLivePage,
  normalizeLiveURL,
  pageLabel,
  pluginDataWithLivePage,
  readLivePage,
  type LivePage
} from './schema'

/** One frame on the current page that shows a page of the running application. */
export type LivePageEntry = {
  nodeId: string
  page: LivePage
  node: SceneNode
  at: Vector
}

/**
 * How many times each page was reloaded; a frame remounts its page on a new value, which is how a
 * page reloads without touching the address the person typed.
 */
const reloads = reactive<Record<string, number>>({})

/**
 * The graph is not reactive, and a layer being moved is moved through a preview only the canvas
 * reads: its position changes without the scene version moving at all. A page lives on such a
 * layer, so it has to follow the preview - otherwise the page stays where the layer was when the
 * drag began, and jumps to the new place only when the mouse is let go.
 */
const previewVersion = ref(0)
let sampling = 0

/** Read the graph's preview version once a frame, so a page follows a layer being moved. */
function followPreviews(graph: { positionPreviewVersion: number }): void {
  if (sampling !== 0 || typeof requestAnimationFrame !== 'function') return
  const step = (): void => {
    if (graph.positionPreviewVersion !== previewVersion.value) {
      previewVersion.value = graph.positionPreviewVersion
    }
    sampling = requestAnimationFrame(step)
  }
  sampling = requestAnimationFrame(step)
}

/**
 * The pages of the running application shown on the canvas: which frames show one, where they sit,
 * and how to link, unlink, and reload them. A page lives on its frame's plugin data, so it travels
 * with the document and an undo brings it back like any other edit.
 *
 * A canvas can show two pages at once: `pageId` names the page a caller draws, which a split pane
 * passes so each pane draws the frames of the page it shows.
 */
export function useLivePages(options: { pageId?: () => string } = {}) {
  const store = useEditorStore()
  followPreviews(store.graph)

  const pages = computed<LivePageEntry[]>(() => {
    // A frame can be moved, resized, or relinked without the page itself changing.
    void store.state.sceneVersion
    // A frame being dragged is only previewed: the canvas draws it in its new place before the edit
    // is committed, and the page has to be in that place too.
    void previewVersion.value
    const pageId = options.pageId?.() ?? store.state.currentPageId
    const at = (nodeId: string) => store.graph.getAbsolutePosition(nodeId)
    /**
     * The pages a layer holds: its own frame's page, or the pages of the frames under the section
     * around it. Pages are opened into sections, and a section gives no coordinate space of its
     * own, so a page inside one sits where its frame does on the page.
     */
    function collect(node: SceneNode): LivePageEntry[] {
      if (!node.visible) return []
      if (canShowLivePage(node)) {
        const page = readLivePage(node)
        if (!page) return []
        return [{ nodeId: node.id, page, node, at: at(node.id) }]
      }
      if (node.type !== 'SECTION') return []
      return node.childIds.flatMap((id) => {
        const child = store.graph.getNode(id)
        return child ? collect(child) : []
      })
    }
    return store.graph.getChildren(pageId).flatMap(collect)
  })

  /** Where a page draws: its frame's border box in the layer's own pixels. */
  function placementOf(entry: LivePageEntry) {
    return pagePlacement(entry.at, entry.node.width, entry.node.height)
  }

  function pageOf(nodeId: string): LivePage | null {
    const node = store.graph.getNode(nodeId)
    return node ? readLivePage(node) : null
  }

  /** Link a frame to a page, or unlink it with null, as one undoable edit. */
  function setPage(nodeId: string, page: LivePage | null): void {
    const node = store.graph.getNode(nodeId)
    if (!node || !canShowLivePage(node)) return
    store.updateNodeWithUndo(
      nodeId,
      { pluginData: pluginDataWithLivePage(node, page) },
      page ? 'Link page' : 'Unlink page'
    )
    if (page === null) reloads[nodeId] = 0
  }

  /**
   * Link a frame to the address as typed, or answer false when the address is not one this app
   * can load. A frame keeps its own size; the page fills it.
   */
  function link(nodeId: string, rawURL: string, label?: string): boolean {
    const url = normalizeLiveURL(rawURL)
    const node = store.graph.getNode(nodeId)
    if (url === '' || !node || !canShowLivePage(node)) return false
    setPage(nodeId, { url, label: pageLabel(label ?? node.name), mode: 'live' })
    return true
  }

  function reload(nodeId: string): void {
    reloads[nodeId] = (reloads[nodeId] ?? 0) + 1
  }

  /**
   * Show a page live or as the picture of it. A page drawn live is its own application, with its own
   * scripts and its own memory: twenty of them on one canvas cost twenty applications, which is what
   * a person feels while zooming. A picture costs an image, so a screen is a picture until somebody
   * works on it.
   */
  function setMode(nodeId: string, mode: LivePage['mode']): void {
    const page = pageOf(nodeId)
    if (page === null || page.mode === mode) return
    setPage(nodeId, { ...page, mode })
  }

  function reloadAll(): void {
    for (const entry of pages.value) reload(entry.nodeId)
  }

  function revisionOf(nodeId: string): number {
    return reloads[nodeId] ?? 0
  }

  return { pages, placementOf, pageOf, setPage, setMode, link, reload, reloadAll, revisionOf }
}

export type LivePages = ReturnType<typeof useLivePages>
