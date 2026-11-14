<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import {
  bringCopyChanges,
  copyChanges,
  copyDiff,
  discardCopyChanges,
  type CopyChange
} from '@/app/live-pages/copy-changes'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'

/**
 * What the agent changed in a screen's copy, and the two things a person can do with it.
 *
 * A copy is a branch of its own, so its work is a diff away from the branch it came from: the files
 * that changed are listed here, one of them opens as a diff, the work is either taken into the
 * working tree or thrown away. Both actions ask first, since neither is one a person means twice.
 */
const { copyPath, branch, repository } = defineProps<{
  copyPath: string
  branch: string
  repository: string
}>()

const messages = useLivePageMessages()
const changes = ref<CopyChange[]>([])
const diff = ref('')
const shown = ref('')
const busy = ref(false)
const asking = ref<'bring' | 'discard' | null>(null)
const outcome = ref('')
const brought = ref(0)

/** What a copy holds now, which is what an agent left there. */
async function refresh(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    changes.value = await copyChanges(copyPath)
    diff.value = ''
    shown.value = ''
    asking.value = null
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

/** Take the copy's work into the working tree, where a person reviews and commits it. */
async function bring(): Promise<void> {
  if (busy.value) return
  busy.value = true
  outcome.value = ''
  try {
    const taken = await bringCopyChanges(
      repository,
      copyPath,
      branch,
      `Take the changes of ${branch}`
    )
    if (taken.ok) {
      brought.value = taken.files.length
      outcome.value = messages.value.copyChangesBrought
      await refresh()
      outcome.value = messages.value.copyChangesBrought
    } else {
      outcome.value =
        taken.reason === 'nothing'
          ? messages.value.copyChangesNothingToBring
          : messages.value.copyChangesBringFailed
    }
  } finally {
    busy.value = false
    asking.value = null
  }
}

/** Drop every change of the copy; the press that asks is the one that runs it. */
async function discard(): Promise<void> {
  if (busy.value) return
  busy.value = true
  outcome.value = ''
  try {
    await discardCopyChanges(copyPath)
    await refresh()
  } finally {
    busy.value = false
    asking.value = null
  }
}

const label = computed(() => (branch === '' ? copyPath : branch))
const canBring = computed(() => changes.value.length > 0 && repository !== '')

onMounted(refresh)
watch(
  () => copyPath,
  () => {
    outcome.value = ''
    void refresh()
  }
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

    <div v-if="canBring" class="mt-1.5 flex flex-wrap items-center gap-1">
      <AppButton
        v-if="asking === null"
        size="sm"
        variant="outline"
        :disabled="busy"
        data-test-id="copy-changes-bring"
        @click="asking = 'bring'"
      >
        {{ messages.copyChangesBring }}
      </AppButton>
      <template v-else-if="asking === 'bring'">
        <AppButton size="sm" variant="outline" :disabled="busy" @click="bring">
          {{ messages.copyChangesBring }}
        </AppButton>
        <button type="button" class="text-3xs text-muted hover:text-surface" @click="asking = null">
          {{ messages.copyChangesCancel }}
        </button>
      </template>

      <AppButton
        v-if="asking === null"
        size="sm"
        variant="outline"
        :disabled="busy"
        data-test-id="copy-changes-discard"
        @click="asking = 'discard'"
      >
        {{ messages.copyChangesDiscard }}
      </AppButton>
      <template v-else-if="asking === 'discard'">
        <AppButton size="sm" variant="outline" :disabled="busy" @click="discard">
          {{ messages.copyChangesDiscard }}
        </AppButton>
        <button type="button" class="text-3xs text-muted hover:text-surface" @click="asking = null">
          {{ messages.copyChangesCancel }}
        </button>
      </template>
    </div>

    <p
      v-if="outcome !== ''"
      class="mt-1 text-3xs leading-snug text-muted"
      data-test-id="copy-changes-outcome"
    >
      {{ outcome }} {{ outcome === messages.copyChangesBrought ? brought : '' }}
    </p>
  </section>
</template>
