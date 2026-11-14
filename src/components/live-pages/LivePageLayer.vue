<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref } from 'vue'

import { resolveEditorProfile, type EditorProfileInputs, type EditorState } from '@open-pencil/core'
import type { ViewportTransform } from '@open-pencil/core/geometry'

import { useEditorStore } from '@/app/editor/active-store'
import { pageOrigin, readLiveSelection } from '@/app/live-pages/bridge'
import { requestPageTree, setPageTree } from '@/app/live-pages/inspect-bridge'
import { readInspectMessage, type InspectMessage } from '@/app/live-pages/inspect-protocol'
import { isPicking, pickFromPage, stylesFromPage, stopPicking } from '@/app/live-pages/pick'
import { layerTransform } from '@/app/live-pages/placement'
import { useLivePageSelection } from '@/app/live-pages/selection'
import { useLivePages } from '@/app/live-pages/use'

import LivePageFrame from './LivePageFrame.vue'

/**
 * The pages of the running application, laid over the canvas at its pan and zoom. The layer takes
 * no pointer while editing, so selecting and panning stay the canvas's; a previewing pane hands
 * the pointer to the page itself.
 *
 * It is also where a page's own answers arrive: the inspector inside every frame reports what a
 * person pointed at, what the page's elements are, and what changed, all over `postMessage`.
 */
const {
  view,
  canvas,
  drawn = null
} = defineProps<{
  view: Pick<EditorState, 'panX' | 'panY' | 'zoom' | 'currentPageId'> & EditorProfileInputs
  /** The canvas that wheel gestures over a page are passed on to. */
  canvas: HTMLElement | null
  /**
   * The pan and zoom of the canvas's last drawn frame. Pages follow it rather than the live view,
   * which runs ahead of the drawing while panning and zooming fast.
   */
  drawn?: ViewportTransform | null
}>()

const { pages, placementOf, revisionOf } = useLivePages({ pageId: () => view.currentPageId })
const { setSelection } = useLivePageSelection()
const store = useEditorStore()
const placement = computed(() => drawn ?? view)
const transform = computed(() => layerTransform(placement.value))
const interactive = computed(() => resolveEditorProfile(view).live !== null)
const root = ref<HTMLElement | null>(null)

// Escape leaves the picking mode, as it leaves every mode the canvas puts a person in.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isPicking.value) stopPicking()
})

/** The origins a selection may come from: only the pages this layer shows. */
const origins = computed(() => {
  const allowed = new Set<string>()
  for (const entry of pages.value) {
    const origin = pageOrigin(entry.page.url)
    if (origin !== null) allowed.add(origin)
  }
  return allowed
})

/**
 * The frame whose page posted a message: the window a page reports from is its own iframe, so it
 * names the frame even when two of them show the same application. A popup the page opened, or a
 * frame that has navigated somewhere else, is not one of these and reports nothing.
 */
function reportingFrame(source: MessageEventSource | null): string | null {
  if (source === null || root.value === null) return null
  for (const frame of root.value.querySelectorAll<HTMLIFrameElement>(
    '[data-test-id="live-page-iframe"]'
  )) {
    if (frame.contentWindow === source) return frame.dataset.nodeId ?? null
  }
  return null
}

/** What the inspector in a page answered. */
function onInspect(nodeId: string, message: InspectMessage): void {
  if (message.type === 'tree') {
    setPageTree(nodeId, message.nodes)
    return
  }
  if (message.type === 'ready') {
    requestPageTree(nodeId)
    return
  }
  if (message.type === 'picked') {
    // A picked element is the frame's own selection too, so the panel describes that screen.
    store.select([nodeId])
    pickFromPage(nodeId, message.pick)
    return
  }
  if (message.type === 'styles') {
    stylesFromPage(nodeId, message.styles, message.rect)
  }
}

function onMessage(event: MessageEvent): void {
  const nodeId = reportingFrame(event.source)
  if (nodeId === null || !origins.value.has(event.origin)) return
  const inspect = readInspectMessage(event.data)
  if (inspect !== null) {
    onInspect(nodeId, inspect)
    return
  }
  const picked = readLiveSelection(event.data)
  if (picked !== null) setSelection(nodeId, picked)
}

useEventListener(window, 'message', onMessage)

function forwardWheel(event: WheelEvent) {
  if (!canvas) return
  event.preventDefault()
  canvas.dispatchEvent(new WheelEvent(event.type, event))
}
</script>

<template>
  <div
    ref="root"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    data-test-id="live-pages"
    @wheel="forwardWheel"
  >
    <div class="absolute top-0 inset-s-0 origin-top-left" :style="{ transform }">
      <LivePageFrame
        v-for="entry in pages"
        :key="entry.nodeId"
        :node-id="entry.nodeId"
        :page="entry.page"
        :placement="placementOf(entry)"
        :revision="revisionOf(entry.nodeId)"
        :interactive="interactive"
        :picking="isPicking"
      />
    </div>
  </div>
</template>
