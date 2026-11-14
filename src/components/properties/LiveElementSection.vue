<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useLivePageMessages, usePanelMessages } from '@open-pencil/vue/i18n'

import { showChatPanel } from '@/app/ai/chat/panel'
import { startScreenTask } from '@/app/ai/chat/screen-task'
import type { LiveStyleKey } from '@/app/live-pages/inspect'
import { LIVE_STYLE_KEYS, selectorOf } from '@/app/live-pages/inspect'
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
 */
const messages = useLivePageMessages()
const panels = usePanelMessages()
const source = useLivePagesSource()
const { picked, styles, written, clearPick, setPickedStyle, resetPickedStyles } = useLivePick()

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
