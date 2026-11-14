<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { documentOf, elementAt, rectOf, type LiveRect } from '@/app/live-pages/inspect'
import type { PagePlacement } from '@/app/live-pages/placement'
import type { LivePage } from '@/app/live-pages/schema'

/**
 * One page of the running application, drawn over the canvas: the frame's own layers stay under
 * it, so a design can be laid on top of the page it replaces.
 *
 * While elements are being picked, the page takes the pointer and reports what is under it, so the
 * box drawn over the page and the properties panel describe the same element.
 */
const {
  page,
  placement,
  revision,
  interactive,
  picking = false,
  selected = null,
  nodeId
} = defineProps<{
  page: LivePage
  placement: PagePlacement
  /** A new revision remounts the page, which is how the page reloads. */
  revision: number
  /** Whether the page takes the pointer, or leaves every gesture to the canvas. */
  interactive: boolean
  /** Whether a click on this page picks the element under it. */
  picking?: boolean
  /** The element of this page the panel shows, which the page outlines while it is picked. */
  selected?: LiveRect | null
  /** The frame this page draws on, which the layer reads back to name the frame that posted. */
  nodeId: string
}>()

const emit = defineEmits<{
  pick: [nodeId: string, element: Element]
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const hovered = ref<LiveRect | null>(null)
/** What stops the listeners this page carries, replaced whenever the page reloads. */
let detach: (() => void) | null = null

function elementAtPage(event: MouseEvent): Element | null {
  const doc = documentOf(frame.value)
  return doc === null ? null : elementAt(doc, event.clientX, event.clientY)
}

function listen(): void {
  stopListening()
  if (!picking) {
    hovered.value = null
    return
  }
  const doc = documentOf(frame.value)
  if (doc === null) return
  const move = (event: MouseEvent): void => {
    const element = elementAtPage(event)
    hovered.value = element === null ? null : rectOf(element)
  }
  const leave = (): void => {
    hovered.value = null
  }
  const click = (event: MouseEvent): void => {
    const element = elementAtPage(event)
    if (element === null) return
    // The page is not asked to follow the link or submit the form a person clicked on.
    event.preventDefault()
    event.stopPropagation()
    emit('pick', nodeId, element)
  }
  doc.addEventListener('mousemove', move)
  doc.addEventListener('mouseleave', leave)
  doc.addEventListener('click', click, true)
  detach = () => {
    doc.removeEventListener('mousemove', move)
    doc.removeEventListener('mouseleave', leave)
    doc.removeEventListener('click', click, true)
  }
}

function stopListening(): void {
  detach?.()
  detach = null
}

watch(() => picking, listen)
// A reloaded page is a new document, so the listeners of the old one are gone with it.
watch(
  () => revision,
  () => {
    hovered.value = null
    listen()
  }
)

onBeforeUnmount(stopListening)

/** The box the page draws around one element, in the page's own pixels. */
function boxStyle(rect: LiveRect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
}
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
      @load="listen"
    />

    <div
      v-if="picking && hovered"
      class="pointer-events-none absolute border border-accent bg-accent/10"
      :style="boxStyle(hovered)"
      data-test-id="live-page-hover"
    />
    <div
      v-if="selected"
      class="pointer-events-none absolute border-2 border-accent"
      :style="boxStyle(selected)"
      data-test-id="live-page-picked"
    />
  </div>
</template>
