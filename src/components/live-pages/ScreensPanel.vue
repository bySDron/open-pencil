<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import { colorToHex } from '@open-pencil/scene-graph/color'
import { shownStatusState } from '@open-pencil/scene-graph/statuses'
import { useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { useEditorStore } from '@/app/editor/active-store'
import { focusNodes } from '@/app/editor/selection/focus'
import { listGitBranches } from '@/app/integrations/git/client'
import { pageOrigin } from '@/app/live-pages/bridge'
import {
  COPY_BRANCH_PREFIX,
  createScreenCopy,
  pluginDataWithScreenCopy,
  readScreenCopy,
  type ScreenCopy
} from '@/app/live-pages/copies'
import { usePageDrift } from '@/app/live-pages/drift/use'
import { useLivePagesSource } from '@/app/live-pages/open'
import type { RouteInfo } from '@/app/live-pages/routes'
import {
  filterScreens,
  groupScreens,
  screensOf,
  type Screen,
  type ScreenFilter,
  type ScreenStatus
} from '@/app/live-pages/screens'
import { useLivePages } from '@/app/live-pages/use'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppInput from '@/components/ui/input/AppInput.vue'

/**
 * The pages of the running application, as a list a person reads: one row per screen, gathered
 * under the area of the address they belong to, with the one action that puts them on the canvas.
 * A row brings its frame into view, or opens the page the canvas lacks, and a screen can be given
 * a copy of its own: a branch beside the one a person is working on.
 */
const store = useEditorStore()
const messages = useLivePageMessages()
const source = useLivePagesSource()
const { pages } = useLivePages()
const { stateOf } = usePageDrift()

const routes = ref<RouteInfo[]>([])
const query = ref('')
const filter = ref<ScreenFilter>('all')
const branches = shallowRef<string[]>([])
const failure = ref('')
const list = ref<HTMLElement | null>(null)

/** The repository the copies are branches of, or null for a document outside every project. */
const repository = computed(() => source.project.value?.repository ?? null)

/**
 * The status a frame shows, as the document's own workflow names and colours it, so the panel
 * reads the same words the canvas writes above the frame.
 */
function statusOf(nodeId: string): ScreenStatus | null {
  const node = store.graph.getNode(nodeId)
  if (!node) return null
  const state = shownStatusState(store.graph, node)
  return state === null ? null : { name: state.name, color: colorToHex(state.color) }
}

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
    changed: (nodeId) => stateOf(nodeId) === 'changed',
    statusOf
  })
)

const groups = computed(() => groupScreens(filterScreens(screens.value, filter.value, query.value)))
const missing = computed(() => screens.value.filter((screen) => screen.nodeId === null).length)

/** What each filter would leave, so a chip never has to be pressed to know. */
const chips = computed(() => [
  { id: 'all' as const, label: messages.value.filterAll, count: screens.value.length },
  {
    id: 'changed' as const,
    label: messages.value.filterChanged,
    count: screens.value.filter((screen) => screen.changed).length
  },
  { id: 'not-open' as const, label: messages.value.filterNotOpen, count: missing.value }
])

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

/** The branches copies could collide with, read once rather than before every copy. */
async function loadBranches(): Promise<void> {
  const repo = repository.value
  if (repo === null) {
    branches.value = []
    return
  }
  const listed = await listGitBranches(repo)
  branches.value = listed.ok ? listed.value.map((branch) => branch.name) : []
}

onMounted(() => {
  void loadRoutes()
  void loadBranches()
})
// A document saved into another project answers another application, so its pages are read again.
watch(
  () => source.project.value?.repository ?? '',
  () => {
    void loadRoutes()
    void loadBranches()
  }
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

/** The copy a screen's frame belongs to, or null while it has none. */
function copyOf(screen: Screen): ScreenCopy | null {
  if (screen.nodeId === null) return null
  const node = store.graph.getNode(screen.nodeId)
  return node ? readScreenCopy(node) : null
}

/** A branch reads without the prefix every copy shares, which a row has no room for. */
function copyLabel(screen: Screen): string {
  const copy = copyOf(screen)
  if (copy === null) return ''
  return copy.branch.startsWith(COPY_BRANCH_PREFIX)
    ? copy.branch.slice(COPY_BRANCH_PREFIX.length)
    : copy.branch
}

/**
 * Give a screen a copy of its own: a branch beside the one a person is on, made without switching,
 * so the work on that screen lands there and comes back as a patch.
 */
async function makeCopy(screen: Screen): Promise<void> {
  const repo = repository.value
  if (repo === null || screen.nodeId === null) {
    failure.value = messages.value.copyNoRepository
    return
  }
  failure.value = ''
  const made = await createScreenCopy(repo, screen, branches.value)
  if (!made.ok) {
    failure.value = messages.value.copyFailed
    return
  }
  const node = store.graph.getNode(screen.nodeId)
  if (node) {
    store.updateNodeWithUndo(
      screen.nodeId,
      { pluginData: pluginDataWithScreenCopy(node, made.value) },
      'Make a copy'
    )
  }
  branches.value = [...branches.value, made.value.branch]
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
    'group/screen flex w-full items-center gap-1.5 rounded px-2 py-1 text-start text-xs',
    'text-surface hover:bg-hover focus-visible:outline-2 focus-visible:outline-panel-focus',
    screen.nodeId !== null && selected.value.has(screen.nodeId) ? 'bg-hover' : ''
  ].join(' ')
}

function dotClass(screen: Screen): string {
  if (screen.status) return ''
  if (screen.changed) return 'bg-accent'
  return screen.nodeId === null ? 'bg-muted/40' : 'bg-success'
}

/** A screen with a status shows the colour its document gives that status. */
function dotStyle(screen: Screen) {
  return screen.status ? { background: screen.status.color } : undefined
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

      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="rounded-full border px-2 py-0.5 text-3xs"
          :class="
            filter === chip.id
              ? 'border-accent/40 bg-accent/15 text-accent'
              : 'border-border text-muted hover:text-surface'
          "
          v-test-id="`screens-filter-${chip.id}`"
          @click="filter = chip.id"
        >
          {{ chip.label }} {{ chip.count }}
        </button>
      </div>

      <p v-if="failure" class="mt-1 text-2xs text-error" role="alert">{{ failure }}</p>
    </div>

    <div ref="list" class="mt-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2" @keydown="onKeydown">
      <section v-for="group in groups" :key="group.area">
        <p class="px-2 pt-2 pb-1 text-3xs font-semibold tracking-wide text-muted uppercase">
          {{ group.title }}
        </p>
        <div
          v-for="screen in group.items"
          :key="screen.url"
          role="button"
          tabindex="0"
          data-screen-row
          :class="rowClass(screen)"
          @click="show(screen)"
          @keydown.enter.prevent="show(screen)"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="dotClass(screen)"
            :style="dotStyle(screen)"
          />
          <span class="min-w-0 flex-1 truncate">{{ screen.name }}</span>
          <span
            v-if="copyOf(screen)"
            class="max-w-24 shrink-0 truncate rounded bg-hover px-1 text-3xs text-surface"
          >
            {{ copyLabel(screen) }}
          </span>
          <span
            v-else-if="screen.changed"
            class="shrink-0 rounded bg-accent/15 px-1 text-3xs text-accent"
          >
            {{ messages.screenChanged }}
          </span>
          <span v-else-if="screen.status" class="shrink-0 text-3xs text-muted">
            {{ screen.status.name }}
          </span>
          <span v-else-if="screen.nodeId === null" class="shrink-0 text-3xs text-muted">
            {{ messages.screenNotOpen }}
          </span>

          <button
            v-if="copyOf(screen) === null && repository !== null && screen.nodeId !== null"
            type="button"
            class="shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-surface focus-visible:opacity-100 group-hover/screen:opacity-100"
            :aria-label="messages.copyScreen"
            v-test-id="`screens-copy-${screen.path}`"
            @click.stop="makeCopy(screen)"
          >
            <icon-lucide-git-branch class="size-3" />
          </button>
        </div>
      </section>

      <p v-if="groups.length === 0" class="px-2 py-3 text-2xs leading-snug text-muted">
        {{ emptyText }}
      </p>
    </div>
  </div>
</template>
