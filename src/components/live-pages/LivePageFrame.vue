<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { clearPageTree, registerPageFrame, sendToPage } from '@/app/live-pages/inspect-bridge'
import type { PagePlacement } from '@/app/live-pages/placement'
import type { LivePage } from '@/app/live-pages/schema'

/**
 * One page of the running application, drawn over the canvas: the frame's own layers stay under
 * it, so a design can be laid on top of the page it replaces.
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
  /** The frame this page draws on, which the layer reads back to name the frame that posted. */
  nodeId: string
}>()

const frame = ref<HTMLIFrameElement | null>(null)

/** Announce the window this frame draws, so requests have somewhere to go. */
function register(): void {
  registerPageFrame(nodeId, frame.value?.contentWindow ?? null)
}

onMounted(register)

onBeforeUnmount(() => {
  registerPageFrame(nodeId, null)
  clearPageTree(nodeId)
})

/** A reloaded page is a new document: the inspector in it starts from a ping. */
function announce(): void {
  register()
  sendToPage(nodeId, { type: 'ping' })
}

watch(
  () => picking,
  (on) => {
    sendToPage(nodeId, { type: on ? 'start' : 'stop' })
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
