<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { selectorOf } from '@/app/live-pages/inspect'
import { requestPageTree, pageTrees, sendToPage } from '@/app/live-pages/inspect/bridge'
import type { PageNode } from '@/app/live-pages/inspect/protocol'
import { pickedElement } from '@/app/live-pages/pick'
import IconButton from '@/components/ui/button/IconButton.vue'

/**
 * The elements of one live page, as the page itself describes them: the layer list of a screen,
 * beside the layers of the canvas.
 *
 * A page is another origin, so this list is what the inspector inside the frame reports over
 * `postMessage`. Clicking a row asks that page to pick the element, which answers with its values
 * for the properties panel - so the list and the panel always describe one element.
 */
const { nodeId } = defineProps<{ nodeId: string }>()

const messages = useLivePageMessages()
const collapsed = ref(new Set<string>())

/** The page's elements, in the order the page laid them out. */
const nodes = computed<PageNode[]>(() => pageTrees()[nodeId] ?? [])

/** The element the panel shows, so a row reads as selected while it is. */
const pickedId = computed(() =>
  pickedElement.value?.nodeId === nodeId ? pickedElement.value.node.id : ''
)

/** A row is hidden while any element above it is collapsed. */
const visible = computed(() => nodes.value.filter((node) => chainVisible(node)))

/** The elements by their id, so a chain is walked without searching the whole list each time. */
const byId = computed(() => new Map(nodes.value.map((node) => [node.id, node])))

function chainVisible(node: PageNode): boolean {
  let parent = node.parentId
  let guard = 0
  while (parent !== null && guard < 64) {
    if (collapsed.value.has(parent)) return false
    parent = byId.value.get(parent)?.parentId ?? null
    guard += 1
  }
  return true
}

function toggle(node: PageNode): void {
  const next = new Set(collapsed.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  collapsed.value = next
}

function select(node: PageNode): void {
  sendToPage(nodeId, { type: 'select', id: node.id })
}

function refresh(): void {
  collapsed.value = new Set()
  answered.value = false
  requestPageTree(nodeId)
  if (timer !== null) clearTimeout(timer)
  // A page that never answers is one whose script did not run: the panel says so rather than
  // waiting in silence.
  timer = setTimeout(() => {
    answered.value = true
    timer = null
  }, ANSWER_TIMEOUT_MS)
}

/** How long a page is given to describe its elements before the panel stops waiting quietly. */
const ANSWER_TIMEOUT_MS = 4000

const answered = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(nodes, (next) => {
  if (next.length === 0) return
  answered.value = false
  if (timer === null) return
  clearTimeout(timer)
  timer = null
})

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})

onMounted(refresh)
watch(
  () => nodeId,
  () => refresh()
)

function rowClass(node: PageNode): string {
  return [
    'flex w-full items-center gap-1 rounded px-1 py-0.5 text-start text-xs',
    node.id === pickedId.value ? 'bg-accent/15 text-accent' : 'text-surface hover:bg-hover'
  ].join(' ')
}

function labelOf(node: PageNode): string {
  return node.text === '' ? selectorOf(node) : node.text
}
</script>

<template>
  <section class="border-b border-border pb-1" data-test-id="live-layers">
    <div class="flex items-center gap-1 px-2 py-1">
      <span
        class="min-w-0 flex-1 truncate text-3xs font-semibold tracking-wide text-muted uppercase"
      >
        {{ messages.screenLayers }}
      </span>
      <span class="shrink-0 text-3xs text-muted" data-test-id="live-layers-count">
        {{ nodes.length }}
      </span>
      <IconButton
        class="size-6"
        :label="messages.reload"
        data-test-id="live-layers-refresh"
        @click="refresh"
      >
        <icon-lucide-rotate-ccw class="size-3" />
      </IconButton>
    </div>

    <div class="max-h-64 overflow-y-auto px-1" data-test-id="live-layers-rows">
      <div
        v-for="node in visible"
        :key="node.id"
        role="button"
        tabindex="0"
        :class="rowClass(node)"
        :style="{ paddingInlineStart: `${4 + node.depth * 10}px` }"
        v-test-id="`live-layer-${node.id}`"
        @click="select(node)"
        @keydown.enter.prevent="select(node)"
      >
        <button
          v-if="nodes.some((candidate) => candidate.parentId === node.id)"
          type="button"
          class="shrink-0 text-muted"
          :aria-label="node.tag"
          @click.stop="toggle(node)"
        >
          <icon-lucide-chevron-right
            class="size-3 transition-transform"
            :class="collapsed.has(node.id) ? '' : 'rotate-90'"
            data-direction="reading"
          />
        </button>
        <span v-else class="w-3 shrink-0" />
        <span class="shrink-0 text-3xs text-muted">{{ node.tag }}</span>
        <span class="min-w-0 flex-1 truncate">{{ labelOf(node) }}</span>
        <span v-if="node.component" class="max-w-24 shrink-0 truncate text-3xs text-muted">
          {{ node.component.name }}
        </span>
      </div>

      <p v-if="nodes.length === 0" class="px-1 py-2 text-2xs leading-snug text-muted">
        {{ answered ? messages.screenNoAnswer : messages.screenLayersWaiting }}
      </p>
    </div>
  </section>
</template>
