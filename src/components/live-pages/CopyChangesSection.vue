<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import {
  copyChanges,
  copyDiff,
  discardCopyChanges,
  type CopyChange
} from '@/app/live-pages/copy-changes'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'

/**
 * What the agent changed in a screen's copy, and the one action that throws it away.
 *
 * A copy is a branch of its own, so its work is a diff away from the branch it came from: the files
 * that changed are listed here, one of them opens as a diff, and a change nobody wants is dropped
 * before it reaches anything a person keeps.
 */
const { copyPath, branch } = defineProps<{ copyPath: string; branch: string }>()

const messages = useLivePageMessages()
const changes = ref<CopyChange[]>([])
const diff = ref('')
const shown = ref('')
const busy = ref(false)
const asking = ref(false)

/** What a copy holds now, which is what an agent left there. */
async function refresh(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    changes.value = await copyChanges(copyPath)
    diff.value = ''
    shown.value = ''
    asking.value = false
  } finally {
    busy.value = false
  }
}

/** The diff of one file, which the panel shows under the list. */
async function show(change: CopyChange): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    shown.value = change.path
    diff.value = await copyDiff(copyPath, change.path)
  } finally {
    busy.value = false
  }
}

/** Drop every change of the copy; the press that asks is the one that runs it. */
async function discard(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await discardCopyChanges(copyPath)
    await refresh()
  } finally {
    busy.value = false
  }
}

const label = computed(() => (branch === '' ? copyPath : branch))

onMounted(refresh)
watch(
  () => copyPath,
  () => refresh()
)
</script>

<template>
  <section class="mt-2 border-t border-border pt-2" data-test-id="copy-changes">
    <div class="flex items-center gap-1">
      <span class="min-w-0 flex-1 truncate text-3xs text-muted" data-test-id="copy-changes-branch">
        {{ label }}
      </span>
      <span class="shrink-0 text-3xs text-muted" data-test-id="copy-changes-count">
        {{ changes.length }}
      </span>
      <IconButton
        :label="messages.copyChangesRefresh"
        data-test-id="copy-changes-refresh"
        @click="refresh"
      >
        <icon-lucide-rotate-ccw class="size-3" />
      </IconButton>
    </div>

    <p v-if="changes.length === 0" class="mt-1 text-3xs leading-snug text-muted">
      {{ messages.copyChangesNone }}
    </p>
    <div v-else class="mt-1 max-h-40 overflow-y-auto">
      <button
        v-for="change in changes"
        :key="change.path"
        type="button"
        class="flex w-full items-center gap-1 rounded px-1 py-0.5 text-start text-3xs"
        :class="shown === change.path ? 'bg-hover text-surface' : 'text-muted hover:text-surface'"
        v-test-id="`copy-change-${change.path}`"
        @click="show(change)"
      >
        <span class="shrink-0 font-mono">{{ change.status }}</span>
        <span class="min-w-0 flex-1 truncate">{{ change.path }}</span>
      </button>
    </div>

    <pre
      v-if="diff !== ''"
      class="mt-1 max-h-48 overflow-auto rounded bg-canvas p-1 text-3xs leading-snug whitespace-pre-wrap"
      data-test-id="copy-changes-diff"
      >{{ diff }}</pre>

    <div v-if="changes.length > 0" class="mt-1.5">
      <AppButton
        v-if="!asking"
        size="sm"
        variant="outline"
        :disabled="busy"
        data-test-id="copy-changes-discard"
        @click="asking = true"
      >
        {{ messages.copyChangesDiscard }}
      </AppButton>
      <div v-else class="flex items-center gap-1">
        <AppButton size="sm" variant="outline" :disabled="busy" @click="discard">
          {{ messages.copyChangesDiscard }}
        </AppButton>
        <button
          type="button"
          class="text-3xs text-muted hover:text-surface"
          @click="asking = false"
        >
          {{ messages.copyChangesCancel }}
        </button>
      </div>
    </div>
  </section>
</template>
