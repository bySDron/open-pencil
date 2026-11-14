<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import { colorToHex } from '@open-pencil/scene-graph/color'
import { shownStatusState } from '@open-pencil/scene-graph/statuses'
import { useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { showChatPanel } from '@/app/ai/chat/panel'
import { startScreenTask } from '@/app/ai/chat/screen-task'
import { useEditorStore } from '@/app/editor/active-store'
import { focusNodes } from '@/app/editor/selection/focus'
import { listGitBranches } from '@/app/integrations/git/client'
import { reachableAddress } from '@/app/live-pages/address'
import { pageOrigin } from '@/app/live-pages/bridge'
import { useScreensConnection } from '@/app/live-pages/connect'
import {
  COPY_BRANCH_PREFIX,
  createScreenCopy,
  pluginDataWithScreenCopy,
  readScreenCopy,
  screenTaskPrompt,
  type ScreenCopy
} from '@/app/live-pages/copies'
import { usePageDrift } from '@/app/live-pages/drift/use'
import { useLivePagesSource } from '@/app/live-pages/open'
import { isPicking, startPicking, stopPicking } from '@/app/live-pages/pick'
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
 * under the area of the address they belong to. A document that names no project is connected in
 * one press — pick the folder of the application — and the screens of a connected document open
 * themselves, without a button to press first.
 *
 * A row brings its frame into view, or opens the page the canvas lacks, and a screen can be given
 * a copy of its own: a branch beside the one a person is working on.
 */
const store = useEditorStore()
const messages = useLivePageMessages()
const source = useLivePagesSource()
const connection = useScreensConnection(source)
const { pages } = useLivePages()
const { stateOf } = usePageDrift()

const routes = ref<RouteInfo[]>([])
const query = ref('')
const filter = ref<ScreenFilter>('all')
const branches = shallowRef<string[]>([])
const failure = ref('')
const list = ref<HTMLElement | null>(null)

/** Whether the document already names the project whose screens it shows. */
const hasProject = computed(() => source.project.value !== null)

/** The repository and application the document is connected to, which a person checks first. */
const projectLine = computed(() => {
  const project = source.project.value
  if (project === null) return ''
  const directory = project.appDirectory === '' ? 'root' : project.appDirectory
  const command =
    project.startCommand.trim() === '' ? messages.value.screensNoCommand : project.startCommand
  return `${project.repository} · ${directory} · ${command}`
})

/** Why the last connection produced nothing, in the panel's own words. */ const connectFailure =
  computed(() => {
    const labels = messages.value
    switch (connection.failure.value) {
      case 'not-repository':
        return labels.connectNotRepository
      case 'unavailable':
        return labels.connectUnavailable
      case 'failed':
        return labels.connectFailed
      case 'no-application':
        return labels.connectNoApplication
      case 'no-address':
        return labels.connectNoAddress
      case 'no-routes':
        return labels.connectNoRoutes
      default:
        return ''
    }
  })

/** What connecting is doing right now, shown in place of the button it was started from. */
const connectPhase = computed(() => {
  const labels = messages.value
  switch (connection.phase.value) {
    case 'choosing':
      return labels.connectChoosing
    case 'starting':
      return labels.connectStarting
    case 'waiting':
      return labels.connectWaiting
    case 'opening':
      return labels.connectOpening
    default:
      return ''
  }
})

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
const emptyText = computed(() =>
  routes.value.length === 0 ? messages.value.screensNoRoutes : messages.value.screensEmpty
)

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

/**
 * The pages on the canvas may point at the other spelling of the application's address: a dev
 * server binds one loopback, and `127.0.0.1` reaches it only when it bound that one. The address
 * is probed and the frames follow whichever spelling answers; nothing is started here, so a person
 * who closed the application keeps it closed.
 */
async function repairFrames(): Promise<void> {
  const base = address.value
  if (base === '') return
  const reachable = await reachableAddress(base)
  if (reachable !== '') source.realign(reachable)
}

/**
 * One press makes the next click on a screen name the element under it; a second press leaves the
 * page to itself again. The page's own inspector reports what was picked.
 */
function togglePick(): void {
  if (isPicking.value) stopPicking()
  else startPicking()
}

/** Whether this mounting of the panel already tried to bring the screens up by itself. */
const autoTried = ref(false)

/**
 * A document that names a project shows that application's screens by itself: the routes are read,
 * the dev server is started when it is not up, and the frames are laid out without a press. Runs
 * once per opening of the panel, so a person who closed the screens keeps them closed.
 */
async function autoShow(): Promise<void> {
  if (autoTried.value || !hasProject.value) return
  autoTried.value = true
  if (missing.value > 0) {
    await connection.ensure(address.value)
    return
  }
  await repairFrames()
}

onMounted(async () => {
  await loadRoutes()
  void loadBranches()
  void autoShow()
})
// A document saved into another project answers another application, so its pages are read again.
watch(
  () => source.project.value?.repository ?? '',
  async () => {
    autoTried.value = false
    await loadRoutes()
    void loadBranches()
    void autoShow()
  }
)

/** The one action for a document that names no project: pick the folder and show its screens. */
async function connect(): Promise<void> {
  if (connection.busy.value) return
  const connected = await connection.connect()
  if (!connected) return
  await loadRoutes()
  void loadBranches()
}

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
 * Hand the screen's copy to the chat: the coding agent starts in the copy's folder and is asked
 * to change that screen alone, with the task waiting in the composer to be sent.
 */
function editScreen(screen: Screen): void {
  const copy = copyOf(screen)
  if (copy === null) return
  startScreenTask({ folder: copy.path, prompt: screenTaskPrompt(screen, copy) })
  showChatPanel()
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
      <!-- A document that names no project asks for one folder, and does the rest itself. -->
      <template v-if="!hasProject">
        <p class="text-2xs leading-snug text-muted">{{ messages.connectProjectHint }}</p>
        <AppButton
          class="mt-2 w-full"
          size="sm"
          color="primary"
          variant="solid"
          :loading="connection.busy.value"
          :disabled="connection.busy.value"
          data-test-id="screens-connect"
          @click="connect"
        >
          {{ messages.connectProject }}
        </AppButton>
        <p
          v-if="connectPhase"
          class="mt-1 text-2xs text-muted"
          data-test-id="screens-connect-phase"
        >
          {{ connectPhase }}
        </p>
        <p
          v-if="connectFailure"
          class="mt-1 text-2xs leading-snug text-error"
          role="alert"
          data-test-id="screens-connect-failure"
        >
          {{ connectFailure }}
        </p>
        <code
          v-if="connection.reason.value"
          class="mt-1 block text-3xs leading-snug text-muted"
          data-test-id="screens-connect-reason"
        >
          {{ connection.reason.value }}
        </code>
      </template>

      <template v-else>
        <p class="truncate text-3xs text-muted" data-test-id="screens-project">
          {{ projectLine }}
        </p>
        <p class="mt-1 text-2xs leading-snug text-muted">{{ messages.screensHint }}</p>
        <AppButton
          class="mt-2 w-full"
          size="sm"
          color="primary"
          variant="solid"
          :disabled="missing === 0 || connection.busy.value"
          data-test-id="screens-show-all"
          @click="showAll"
        >
          {{ messages.showAllScreens }}
        </AppButton>
        <!-- A screen is a page of the running application: one press makes its elements pickable. -->
        <AppButton
          class="mt-1.5 w-full"
          size="sm"
          variant="outline"
          :disabled="pages.length === 0"
          data-test-id="screens-pick"
          @click="togglePick"
        >
          <template #leading>
            <icon-lucide-mouse-pointer class="size-3.5" />
          </template>
          {{ isPicking ? messages.pickHint : messages.pickElement }}
        </AppButton>
        <p
          v-if="connectPhase"
          class="mt-1 text-2xs text-muted"
          data-test-id="screens-connect-phase"
        >
          {{ connectPhase }}
        </p>
        <p
          v-if="connectFailure"
          class="mt-1 text-2xs leading-snug text-error"
          role="alert"
          data-test-id="screens-connect-failure"
        >
          {{ connectFailure }}
        </p>
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
      </template>
    </div>

    <div
      v-if="hasProject"
      ref="list"
      class="mt-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2"
      @keydown="onKeydown"
    >
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
            v-if="copyOf(screen) !== null"
            type="button"
            class="shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-surface focus-visible:opacity-100 group-hover/screen:opacity-100"
            :aria-label="messages.editScreen"
            v-test-id="`screens-edit-${screen.path}`"
            @click.stop="editScreen(screen)"
          >
            <icon-lucide-pencil-line class="size-3" />
          </button>

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
