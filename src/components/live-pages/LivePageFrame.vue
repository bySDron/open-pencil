<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Vector } from '@open-pencil/scene-graph/primitives'

import { useEditorStore } from '@/app/editor/active-store'
import { selectorOf } from '@/app/live-pages/inspect'
import { clearPageTree, registerPageFrame, sendToPage } from '@/app/live-pages/inspect/bridge'
import { pickedElement } from '@/app/live-pages/pick'
import type { PagePlacement } from '@/app/live-pages/placement'
import type { LivePage } from '@/app/live-pages/schema'
import { onFrameTick } from '@/app/live-pages/ticker'
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
  canvas = null,
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
  /** The canvas a gesture over this page belongs to. */
  canvas?: HTMLElement | null
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
  stopPlacing = onFrameTick(place)
})

onBeforeUnmount(() => {
  stopPlacing()
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

/** Where this page was last drawn, so a frame that has not moved writes nothing. */
let placed = ''
let stopPlacing: () => void = () => undefined

/** A point inside a page, in the page's own pixels. */
type PagePoint = Vector

/** Where the pointer went down on the shield, so a click is told from a drag. */
let pressed: PagePoint | null = null
let hoveredAt = 0

/**
 * Whether a gesture that began on the shield is still running.
 *
 * While it is, the page takes no pointer at all: the canvas owns the gesture and has to see the
 * moves, which it only does when nothing of the page stands in their way.
 */
const dragging = ref(false)

/** A point of the page, from a point of the window: the page is drawn scaled with the canvas. */
function pagePoint(event: MouseEvent): PagePoint | null {
  const box = wrapper.value
  if (box === null || placement.width === 0) return null
  const rect = box.getBoundingClientRect()
  const zoom = rect.width / placement.width
  if (zoom <= 0) return null
  return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
}

/**
 * The shield: the layer of this page that keeps the pointer.
 *
 * A page is a document of its own, so every gesture over it belongs to it - the wheel would scroll a
 * screen instead of zooming the canvas, and a drag would scroll the page instead of moving the
 * frame. A screen a person works on therefore sits under this shield: the wheel and the drag go to
 * the canvas, and the element under the pointer is found by sending its place into the page.
 */
function onShieldDown(event: MouseEvent): void {
  pressed = { x: event.clientX, y: event.clientY }
  // The canvas owns the gesture from here: the page steps out of the way for its whole length, so
  // the moves reach the canvas and the frame follows the pointer rather than jumping at the end.
  dragging.value = true
  const press = {
    clientX: event.clientX,
    clientY: event.clientY,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse'
  }
  canvas?.dispatchEvent(new PointerEvent('pointerdown', press))
  canvas?.dispatchEvent(new MouseEvent('mousedown', press))
}

/**
 * The end of a gesture the shield began: a pointer that barely moved is a click, and a click picks
 * the element at that place. The page took no pointer while the gesture ran, so its end is read
 * from the window rather than from the shield.
 */
function endGesture(event: MouseEvent): void {
  dragging.value = false
  const start = pressed
  pressed = null
  if (start === null) return
  const dragged =
    Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4
  if (dragged) return
  const point = pagePoint(event)
  if (point !== null) sendToPage(nodeId, { type: 'pickAt', x: point.x, y: point.y })
}

function onShieldMove(event: MouseEvent): void {
  const now = performance.now()
  if (now - hoveredAt < 60) return
  hoveredAt = now
  const point = pagePoint(event)
  if (point !== null) sendToPage(nodeId, { type: 'hoverAt', x: point.x, y: point.y })
}

// The end of a gesture is read from the window: while it runs, the page takes no pointer at all.
useEventListener(window, 'mouseup', endGesture)

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
      !dragging && (interactive || focused) ? 'pointer-events-auto' : 'pointer-events-none'
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
    <div
      v-if="runs && picking"
      class="absolute inset-0"
      data-test-id="live-page-shield"
      @mousedown="onShieldDown"
      @mousemove="onShieldMove"
    />
  </div>
</template>
