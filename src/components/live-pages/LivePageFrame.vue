<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useEditorStore } from '@/app/editor/active-store'
import { selectorOf } from '@/app/live-pages/inspect'
import { clearPageTree, registerPageFrame, sendToPage } from '@/app/live-pages/inspect/bridge'
import { pickedElement } from '@/app/live-pages/pick'
import type { PagePlacement } from '@/app/live-pages/placement'
import type { LivePage } from '@/app/live-pages/schema'
import { useLivePages } from '@/app/live-pages/use'

/**
 * One page of the running application, drawn over the canvas: the frame's own layers stay under
 * it, so a design can be laid on top of the page it replaces.
 *
 * The page is always the real application, never a picture of it. What makes a canvas of twenty of
 * them affordable is the parking the GPU canvas uses for its own nodes: a page outside the view is
 * still running - its scripts, its state, its scroll position - but it is not drawn, so the canvas
 * pays nothing for it per frame. A page that comes back into the view is drawn again at once, live,
 * exactly as it was.
 *
 * The page is inspected from inside: a script the window injects into every frame answers over
 * `postMessage`, which is the only way a page of another origin can be read at all. This component
 * only hands that page the window it draws and asks for what the canvas needs.
 */
const {
  page,
  placement,
  revision,
  interactive,
  picking = false,
  running = true,
  parked = false,
  focused = false,
  nodeId
} = defineProps<{
  page: LivePage
  placement: PagePlacement
  /** A new revision remounts the page, which is how the page reloads. */
  revision: number
  /** Whether the page takes the pointer, or leaves every gesture to the canvas. */
  interactive: boolean
  /** Whether a click on this page picks the element under it instead of reaching the page. */
  picking?: boolean
  /** Whether the page runs at all, which is from the moment it first came near the view. */
  running?: boolean
  /** Whether the page is out of sight, and so left undrawn while it keeps running. */
  parked?: boolean
  /** Whether this screen is the one a person is working on. */
  focused?: boolean
  /** The frame this page draws on, which the layer reads back to name the frame that posted. */
  nodeId: string
}>()

const { setMode } = useLivePages()
const store = useEditorStore()

const frame = ref<HTMLIFrameElement | null>(null)
const wrapper = ref<HTMLElement | null>(null)

/** Whether this screen runs its own application here. */
const runs = computed(() => page.mode === 'live' && running)

/** Announce the window this frame draws, so requests have somewhere to go. */
function register(): void {
  registerPageFrame(nodeId, frame.value?.contentWindow ?? null)
}

onMounted(() => {
  if (runs.value) register()
  place()
  tick()
})

onBeforeUnmount(() => {
  stopPlacing()
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

/** Where this page was last drawn, so a frame that has not moved writes nothing. */
let placed = ''

/**
 * Follow the canvas for as long as this page exists.
 *
 * The loop is this page's own: a shared one stops for every page when any single reader throws, and
 * a page that stops being placed is a page left behind at the place a drag began.
 */
function tick(): void {
  place()
  handle = requestAnimationFrame(tick)
}

let handle = 0

function stopPlacing(): void {
  if (handle !== 0) cancelAnimationFrame(handle)
  handle = 0
}

/**
 * Put this page where the canvas draws its layer.
 *
 * A page sits over the canvas rather than in it, so nothing places it for us. Reading the place
 * from the layer's own versions is not enough: a layer being dragged is drawn from a preview that
 * is not an edit and never reaches them, which leaves the page at the place the drag began until
 * the mouse is let go. The graph is read directly, once a frame, and the box is moved by transform,
 * which the compositor applies without laying the page out again.
 */
function place(): void {
  const box = wrapper.value
  if (box === null) return
  const node = store.graph.getNode(nodeId)
  if (!node) return
  const at = store.graph.getAbsolutePosition(nodeId)
  const key = `${at.x}|${at.y}|${node.width}|${node.height}`
  if (key === placed) return
  box.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`
  box.style.width = `${node.width}px`
  box.style.height = `${node.height}px`
  placed = key
}

/** A reloaded page is a new document: the inspector in it starts from a ping. */
function announce(): void {
  register()
  sendToPage(nodeId, { type: 'ping' })
  // Picking is the mode a screen is opened in, so a page that has just drawn itself is told about
  // it as well: a page nobody told goes back to swallowing the clicks meant for its elements.
  if (picking) sendToPage(nodeId, { type: 'start' })
  // The page drew itself again: the element a person had picked is found by its own name, so the
  // panel keeps describing the thing they chose rather than forgetting it on every reload.
  const current = pickedElement.value
  if (current !== null && current.nodeId === nodeId) {
    sendToPage(nodeId, { type: 'pickSelector', selector: selectorOf(current.node) })
  }
}

// A page that starts running has a window of its own from the moment it is drawn, which is the
// moment a picked element inside it can be found again.
watch(runs, async (on) => {
  if (on) {
    await nextTick()
    announce()
    return
  }
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

watch(
  () => picking,
  (on) => {
    // An element is picked inside the page itself: a screen that does not run yet runs first.
    if (on && !runs.value) {
      setMode(nodeId, 'live')
      return
    }
    sendToPage(nodeId, { type: on ? 'start' : 'stop' })
  }
)

// A reloaded page is a different page: whatever the panel kept of it was of the old one.
watch(
  () => revision,
  () => {
    clearPageTree(nodeId)
  }
)
</script>

<template>
  <div
    ref="wrapper"
    class="absolute top-0 inset-s-0 overflow-hidden"
    :class="
      !picking && (interactive || focused) ? 'pointer-events-auto' : 'pointer-events-none'
    "
    :style="{
      width: `${placement.width}px`,
      height: `${placement.height}px`,
      // A page is moved the way the canvas moves a layer under it: by transform, which the compositor
      // applies without laying the page out again. Moved by its offset instead, a page keeps its old
      // surface painted under the new place until the drag ends, which reads as a ghost of itself.
      transform: `translate3d(${placement.left}px, ${placement.top}px, 0)`,
      willChange: 'transform',
      // A page out of sight is parked: its layout stays, its paint is skipped, and it keeps running.
      contentVisibility: parked ? 'hidden' : undefined
    }"
    data-test-id="live-page-frame"
    :data-frame-id="nodeId"
  >
    <iframe
      v-if="runs"
      ref="frame"
      :key="revision"
      :src="page.url"
      :aria-label="page.label ?? page.url"
      :data-node-id="nodeId"
      class="size-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      referrerpolicy="no-referrer"
      loading="lazy"
      data-test-id="live-page-iframe"
      @load="announce"
    />

  </div>
</template>
