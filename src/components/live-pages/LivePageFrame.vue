<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { selectorOf } from '@/app/live-pages/inspect'
import { clearPageTree, registerPageFrame, sendToPage } from '@/app/live-pages/inspect/bridge'
import { pickedElement } from '@/app/live-pages/pick'
import type { PagePlacement } from '@/app/live-pages/placement'
import type { LivePage } from '@/app/live-pages/schema'
import { useScreenThumbnails } from '@/app/live-pages/thumbnails'
import { useLivePages } from '@/app/live-pages/use'

/**
 * One page of the running application, drawn over the canvas: the frame's own layers stay under
 * it, so a design can be laid on top of the page it replaces.
 *
 * A page is the real application, and the canvas decides how much of it costs anything. One screen
 * runs: the one a person is working on. Every other screen is the picture the list keeps of it, so a
 * canvas of twenty screens is one application and twenty images, and panning or zooming touches no
 * page at all - which is the whole of what makes an infinite canvas of screens usable.
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
  awake = true,
  watched = true,
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
  /** Whether the page runs at all, or the canvas draws the picture of it. */
  running?: boolean
  /** Whether the page is drawn as itself, or covered by its picture while the view moves. */
  awake?: boolean
  /** Whether this screen is in the view, which is when its picture is worth taking. */
  watched?: boolean
  /** The frame this page draws on, which the layer reads back to name the frame that posted. */
  nodeId: string
}>()

const thumbnails = useScreenThumbnails()
const { setMode } = useLivePages()

const frame = ref<HTMLIFrameElement | null>(null)

/** Whether this screen runs its own application here. */
const runs = computed(() => page.mode === 'live' && running)

/** Whether the page itself is what a person sees, rather than the picture of it. */
const showsPage = computed(() => runs.value && awake)

/** The picture of a screen that is not drawn as itself, taken by the machine's own browser. */
const picture = computed(() => thumbnails.thumbnailOf(page.url)?.src ?? null)

/** Announce the window this frame draws, so requests have somewhere to go. */
function register(): void {
  registerPageFrame(nodeId, frame.value?.contentWindow ?? null)
}

/** Ask for the picture a screen is covered by while the view moves, or when it does not run. */
function askForPicture(): void {
  if (watched) thumbnails.request(page.url)
}

onMounted(() => {
  askForPicture()
  if (runs.value) register()
})

// A screen that comes into the view gets its picture taken, which is what the canvas draws in
// place of the application itself.
watch(
  () => watched,
  (on) => {
    if (on) askForPicture()
  }
)

onBeforeUnmount(() => {
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

/** A reloaded page is a new document: the inspector in it starts from a ping. */
function announce(): void {
  register()
  sendToPage(nodeId, { type: 'ping' })
  // The page drew itself again: the element a person had picked is found by its own name, so the
  // panel keeps describing the thing they chose rather than forgetting it on every reload.
  const current = pickedElement.value
  if (current !== null && current.nodeId === nodeId) {
    sendToPage(nodeId, { type: 'pickSelector', selector: selectorOf(current.node) })
  }
}

// A page that comes back into the view is a window of its own again from the moment it is drawn,
// which is the moment a picked element inside it can be found.
watch(runs, async (on) => {
  if (on) {
    await nextTick()
    announce()
    return
  }
  // A screen too far to run keeps no window and no layer list: its picture stands for it.
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

watch(
  () => awake,
  (on) => {
    if (!on) askForPicture()
  }
)

watch(
  () => picking,
  (on) => {
    // An element is picked inside the page itself: a screen drawn as a picture runs first, since a
    // picture has no elements to pick.
    if (on && !runs.value) {
      setMode(nodeId, 'live')
      return
    }
    sendToPage(nodeId, { type: on ? 'start' : 'stop' })
  }
)

// A page that moved to another address is another page, and its picture is of the one it left.
watch(
  () => page.url,
  () => {
    askForPicture()
  }
)

// A reloaded page is a different page: the picture the list kept of it was of the old one.
watch(
  () => revision,
  () => {
    thumbnails.forget(page.url)
  }
)
</script>

<template>
  <div
    class="absolute overflow-hidden"
    :class="interactive || picking ? 'pointer-events-auto' : 'pointer-events-none'"
    :style="{
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      width: `${placement.width}px`,
      height: `${placement.height}px`
    }"
    data-test-id="live-page-frame"
  >
    <iframe
      v-if="runs"
      ref="frame"
      :key="revision"
      :src="page.url"
      :aria-label="page.label ?? page.url"
      :data-node-id="nodeId"
      class="size-full border-0 bg-white"
      :class="showsPage ? '' : 'invisible'"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      referrerpolicy="no-referrer"
      loading="lazy"
      data-test-id="live-page-iframe"
      @load="announce"
    />
    <img
      v-if="!showsPage && picture !== null"
      :src="picture"
      :alt="page.label ?? page.url"
      class="absolute inset-0 size-full select-none object-cover object-top"
      draggable="false"
      data-test-id="live-page-picture"
    />
    <div
      v-else-if="!showsPage"
      class="size-full bg-white"
      data-test-id="live-page-picture-empty"
    />
  </div>
</template>
