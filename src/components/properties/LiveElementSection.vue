<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useLivePageMessages, usePanelMessages } from '@open-pencil/vue/i18n'

import { showChatPanel } from '@/app/ai/chat/panel'
import { startScreenTask } from '@/app/ai/chat/screen-task'
import type { LiveStyleKey } from '@/app/live-pages/inspect'
import { LIVE_STYLE_KEYS, selectorOf } from '@/app/live-pages/inspect'
import { pageTrees, sendToPage } from '@/app/live-pages/inspect-bridge'
import type { PageNode } from '@/app/live-pages/inspect-protocol'
import { useLivePagesSource } from '@/app/live-pages/open'
import { useLivePick } from '@/app/live-pages/pick'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'
import AppInput from '@/components/ui/input/AppInput.vue'
import PanelSection from '@/components/ui/panel/PanelSection.vue'

/**
 * The element a person picked in a live page, and the values of it they can change: the same rows
 * a drawn layer has, read from the page itself rather than from the design. A value is written on
 * the element the moment it is committed, so the page shows the change without a reload; the
 * source of that element is where it has to live, which the one action hands to the agent.
 *
 * The chain above the element is what a page usually needs: the box that is really in charge of a
 * layout is rarely the one under the pointer, so every ancestor is one click away.
 */
const messages = useLivePageMessages()
const panels = usePanelMessages()
const source = useLivePagesSource()
const { picked, styles, written, clearPick, setPickedStyle, resetPickedStyles } = useLivePick()

/** The elements of the page the picked one belongs to, by id. */
const tree = computed<Map<string, PageNode>>(() => {
  const nodeId = picked.value?.nodeId
  const nodes = nodeId === undefined ? [] : (pageTrees()[nodeId] ?? [])
  return new Map(nodes.map((node) => [node.id, node]))
})

/** The picked element and the elements it sits in, from the page down to the root. */
const chain = computed<PageNode[]>(() => {
  const current = picked.value
  if (current === null) return []
  const path: PageNode[] = [{ ...current.node, id: current.node.id }]
  let parent = current.node.parentId
  let guard = 0
  while (parent !== null && guard < 64) {
    const found = tree.value.get(parent)
    if (found === undefined) break
    path.unshift(found)
    parent = found.parentId
    guard += 1
  }
  return path
})

/** Pick an ancestor, so a layout that misbehaves is found by walking up instead of guessing. */
function selectAncestor(node: PageNode): void {
  const nodeId = picked.value?.nodeId
  if (nodeId === undefined || node.id === '') return
  sendToPage(nodeId, { type: 'select', id: node.id })
}

/** The rows the panel shows, in the order it shows them, with the words of the design panel. */
const fields = computed<{ key: LiveStyleKey; label: string }[]>(() => [
  { key: 'width', label: panels.value.width },
  { key: 'height', label: panels.value.height },
  { key: 'padding', label: messages.value.elementPadding },
  { key: 'gap', label: panels.value.gap },
  { key: 'font-size', label: panels.value.fontSize },
  { key: 'color', label: messages.value.elementColor },
  { key: 'background-color', label: messages.value.elementBackground },
  { key: 'border-radius', label: panels.value.radius },
  { key: 'opacity', label: panels.value.opacity }
])

/** What the fields show: the values the page has now, edited here until they are committed. */
const draft = ref<Record<LiveStyleKey, string>>(keysOf(null))
watch(
  styles,
  (next) => {
    draft.value = keysOf(next)
  },
  { immediate: true }
)

/** The values the page reported, taken only for the keys this panel shows. */
function keysOf(values: Record<string, string> | null): Record<LiveStyleKey, string> {
  return Object.fromEntries(LIVE_STYLE_KEYS.map((key) => [key, values?.[key] ?? ''])) as Record<
    LiveStyleKey,
    string
  >
}

/** A value reaches the page when the field is left or Enter is pressed, not on every letter. */
function commit(key: LiveStyleKey): void {
  setPickedStyle(key, draft.value[key])
}

/** The values this app wrote, which is what the source of the element has to receive. */
const changed = computed(() =>
  Object.entries(written.value)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
)

const selector = computed(() => (picked.value === null ? '' : selectorOf(picked.value.node)))

/**
 * Hand the change to the agent: the element is named by its selector and by the component file the
 * page reports, so the agent edits that element rather than the whole screen.
 */
function applyToCode(): void {
  const current = picked.value
  const repository = source.project.value?.repository
  if (current === null || repository === undefined || changed.value === '') return
  const component = current.node.component
  startScreenTask({
    folder: repository,
    prompt: [
      `In the running application of this project, the element \`${selector.value}\` was changed in the browser to: ${changed.value}.`,
      component === null ? '' : `The page reports it is rendered by \`${component.file}\`.`,
      'Make that change in the element’s own source, and only there: a style or a class of that element, not a global one.',
      'Say which file you changed and why the element you picked is that one.'
    ]
      .filter((line) => line !== '')
      .join(' ')
  })
  showChatPanel()
}
</script>

<template>
  <PanelSection v-if="picked" :label="messages.elementTitle">
    <template #actions>
      <IconButton
        :label="messages.elementReset"
        :disabled="changed === ''"
        data-test-id="live-element-reset"
        @click="resetPickedStyles"
      >
        <icon-lucide-rotate-ccw class="size-3.5" />
      </IconButton>
      <IconButton
        :label="messages.elementClear"
        data-test-id="live-element-clear"
        @click="clearPick"
      >
        <icon-lucide-x class="size-3.5" />
      </IconButton>
    </template>

    <!-- A layout is usually set by a box above the one under the pointer: every ancestor is a press. -->
    <div
      v-if="chain.length > 1"
      class="mb-1 flex flex-wrap items-center gap-0.5"
      data-test-id="live-element-chain"
    >
      <template v-for="(node, index) in chain" :key="node.id">
        <icon-lucide-chevron-right
          v-if="index > 0"
          class="size-2.5 shrink-0 text-muted"
          data-direction="reading"
        />
        <button
          type="button"
          class="max-w-24 truncate rounded px-1 text-3xs"
          :class="index === chain.length - 1 ? 'text-surface' : 'text-muted hover:text-surface'"
          @click="selectAncestor(node)"
        >
          {{ node.tag
          }}<span v-if="node.classes.length" class="text-muted">.{{ node.classes[0] }}</span>
        </button>
      </template>
    </div>

    <div class="flex items-baseline gap-1.5">
      <code class="min-w-0 flex-1 truncate text-2xs text-surface" data-test-id="live-element-name">
        {{ selector }}
      </code>
      <span
        v-if="picked.node.component"
        class="max-w-28 shrink-0 truncate text-3xs text-muted"
        data-test-id="live-element-component"
      >
        {{ picked.node.component.name }}
      </span>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
      <label v-for="field in fields" :key="field.key" class="flex min-w-0 flex-col gap-0.5">
        <span class="text-3xs text-muted">{{ field.label }}</span>
        <AppInput
          v-model="draft[field.key]"
          size="xs"
          tone="panel"
          :aria-label="field.label"
          :state="written[field.key] === undefined ? 'idle' : 'mixed'"
          @change="commit(field.key)"
          @enter="commit(field.key)"
        />
      </label>
    </div>

    <p class="mt-2 text-3xs leading-snug text-muted">{{ messages.elementHint }}</p>

    <div class="mt-1.5 flex items-center gap-1.5">
      <AppButton
        size="sm"
        variant="outline"
        :disabled="changed === '' || source.project.value === null"
        data-test-id="live-element-to-code"
        @click="applyToCode"
      >
        {{ messages.elementToCode }}
      </AppButton>
      <p
        class="min-w-0 flex-1 text-3xs leading-snug text-muted"
        data-test-id="live-element-changed"
      >
        {{ changed }}
      </p>
    </div>
  </PanelSection>
</template>
