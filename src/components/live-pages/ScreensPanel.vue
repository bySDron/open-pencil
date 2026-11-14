<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useLivePageMessages } from '@open-pencil/vue/i18n'

import { useEditorStore } from '@/app/editor/active-store'
import { focusNodes } from '@/app/editor/selection/focus'
import { pageOrigin } from '@/app/live-pages/bridge'
import { usePageDrift } from '@/app/live-pages/drift/use'
import { useLivePagesSource } from '@/app/live-pages/open'
import type { RouteInfo } from '@/app/live-pages/routes'
import { filterScreens, groupScreens, screensOf, type Screen } from '@/app/live-pages/screens'
import { useLivePages } from '@/app/live-pages/use'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppInput from '@/components/ui/input/AppInput.vue'

/**
 * The pages of the running application, as a list a person reads: one row per screen, gathered
 * under the area of the address they belong to, with the one action that puts them on the canvas.
 * A row brings its frame into view; a row the canvas does not hold yet opens it.
 */
const store = useEditorStore()
const messages = useLivePageMessages()
const source = useLivePagesSource()
const { pages } = useLivePages()
const { stateOf } = usePageDrift()

const routes = ref<RouteInfo[]>([])
const query = ref('')
const list = ref<HTMLElement | null>(null)

/** The frames the canvas already shows, as the list matches them to the routes they answer. */
const open = computed(() =>
  pages.value.map((entry) => ({ nodeId: entry.nodeId, url: entry.page.url, name: entry.node.name }))
)

/**
 * The address to build a page's own from: the one the project was set up with, or the one an
 * open page answers on, so a document with a linked page still lists that page's neighbours.
 */
const address = computed(() => {
  const configured = source.baseAddress.value.trim()
  if (configured !== '') return configured
  const [first] = pages.value
  return first ? (pageOrigin(first.page.url) ?? '') : ''
})

const screens = computed(() =>
  screensOf({
    routes: routes.value,
    address: address.value,
    open: open.value,
    changed: (nodeId) => stateOf(nodeId) === 'changed'
  })
)

const groups = computed(() => groupScreens(filterScreens(screens.value, 'all', query.value)))
const missing = computed(() => screens.value.filter((screen) => screen.nodeId === null).length)

const selected = computed(() => {
  void store.state.sceneVersion
  return store.state.selectedIds
})

/** Why the list is empty, in the words that tell a person what to do about it. */
const emptyText = computed(() => {
  if (source.project.value === null) return messages.value.screensNoProject
  return routes.value.length === 0 ? messages.value.screensNoRoutes : messages.value.screensEmpty
})

async function loadRoutes(): Promise<void> {
  routes.value = await source.listRoutes()
}

onMounted(() => void loadRoutes())
// A document saved into another project answers another application, so its pages are read again.
watch(
  () => source.project.value?.repository ?? '',
  () => void loadRoutes()
)

/** The one action: every page the canvas is still missing, as frames of their areas. */
function showAll(): void {
  source.openAll(routes.value, address.value)
}

/** A row brings its frame into view, and opens the page when the canvas does not hold it yet. */
function show(screen: Screen): void {
  if (screen.nodeId !== null) {
    focusNodes(store, [screen.nodeId])
    return
  }
  // `openAll` reads the path and the parameters of a route; a listed screen already has the path.
  source.openAll([{ route: screen.path, file: '', params: [] }], address.value)
}

/** Arrow keys walk the rows, so the list is used without the pointer, as a layer list is. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const rows = [...(list.value?.querySelectorAll<HTMLElement>('[data-screen-row]') ?? [])]
  const at = rows.indexOf(document.activeElement as HTMLElement)
  const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)]
  if (at === -1 || next === undefined) return
  event.preventDefault()
  next.focus()
}

function rowClass(screen: Screen): string {
  return [
    'flex w-full items-center gap-1.5 rounded px-2 py-1 text-start text-xs text-surface',
    'hover:bg-hover focus-visible:outline-2 focus-visible:outline-panel-focus',
    screen.nodeId !== null && selected.value.has(screen.nodeId) ? 'bg-hover' : ''
  ].join(' ')
}

function dotClass(screen: Screen): string {
  if (screen.changed) return 'bg-accent'
  return screen.nodeId === null ? 'bg-muted/40' : 'bg-success'
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-test-id="screens-panel">
    <div class="shrink-0 px-3 pt-2">
      <p class="text-2xs leading-snug text-muted">{{ messages.screensHint }}</p>
      <AppButton
        class="mt-2 w-full"
        size="sm"
        color="primary"
        variant="solid"
        :disabled="missing === 0"
        data-test-id="screens-show-all"
        @click="showAll"
      >
        {{ messages.showAllScreens }}
      </AppButton>
      <AppInput
        v-model="query"
        type="search"
        :placeholder="messages.screenSearch"
        :aria-label="messages.screenSearch"
        tone="panel"
        size="xs"
        class="mt-2"
        data-test-id="screens-search"
      />
    </div>

    <div ref="list" class="mt-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2" @keydown="onKeydown">
      <section v-for="group in groups" :key="group.area">
        <p class="px-2 pt-2 pb-1 text-3xs font-semibold tracking-wide text-muted uppercase">
          {{ group.title }}
        </p>
        <button
          v-for="screen in group.items"
          :key="screen.url"
          type="button"
          data-screen-row
          :class="rowClass(screen)"
          @click="show(screen)"
        >
          <span class="size-1.5 shrink-0 rounded-full" :class="dotClass(screen)" />
          <span class="min-w-0 flex-1 truncate">{{ screen.name }}</span>
          <span
            v-if="screen.changed"
            class="shrink-0 rounded bg-accent/15 px-1 text-3xs text-accent"
          >
            {{ messages.screenChanged }}
          </span>
          <span v-else-if="screen.nodeId === null" class="shrink-0 text-3xs text-muted">
            {{ messages.screenNotOpen }}
          </span>
        </button>
      </section>

      <p v-if="groups.length === 0" class="px-2 py-3 text-2xs leading-snug text-muted">
        {{ emptyText }}
      </p>
    </div>
  </div>
</template>
