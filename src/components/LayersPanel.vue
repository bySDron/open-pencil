<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, ref } from 'vue'

import { useI18n, useLivePageMessages } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { useEditorStore } from '@/app/editor/active-store'
import { readLivePage } from '@/app/live-pages/schema'
import AppMenu from '@/components/shell/AppMenu.vue'
import SegmentedControl from '@/components/ui/select/SegmentedControl.vue'
import splitterTheme from '@/theme/splitter'

import AssetsPanel from './assets-panel/AssetsPanel.vue'
import LayerTree from './LayerTree/LayerTree.vue'
import LiveLayersSection from './live-pages/LiveLayersSection.vue'
import ScreensPanel from './live-pages/ScreensPanel.vue'
import PagesPanel from './PagesPanel.vue'

const { menu, panels } = useI18n()
const livePages = useLivePageMessages()
const activePanel = ref<'file' | 'screens' | 'assets'>('file')
const panelModel = computed({
  get: () => activePanel.value,
  set: (value: string) => {
    if (value === 'file' || value === 'screens' || value === 'assets') activePanel.value = value
  }
})
const panelOptions = computed(() => [
  { value: 'file', label: menu.value.file },
  // The pages of the running application sit beside the layers, since both are what a person
  // navigates by; the properties that describe one page stay on the right.
  { value: 'screens', label: livePages.value.screens },
  { value: 'assets', label: panels.value.assets }
])
const panelTestIds: Record<string, string> = {
  file: 'left-panel-layers-tab',
  screens: 'left-panel-screens-tab',
  assets: 'left-panel-assets-tab'
}
const panelTabsUI = { root: 'w-full' }

/**
 * The frame whose page is being looked at, if the canvas selection is a live screen: its elements
 * are the layers a designer works with, and the panel asks the page for them itself.
 */
const store = useEditorStore()
const liveNodeId = computed(() => {
  void store.state.sceneVersion
  const [id] = store.state.selectedIds
  const node = id ? store.graph.getNode(id) : undefined
  return node && readLivePage(node) !== null ? node.id : ''
})
const splitterStyles = tv(splitterTheme)({ direction: 'vertical' })
</script>

<template>
  <aside
    data-test-id="layers-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-e border-border bg-panel"
    style="contain: paint layout style"
  >
    <AppMenu />
    <div class="shrink-0 border-b border-border px-2 py-1.5">
      <SegmentedControl
        v-model="panelModel"
        :options="panelOptions"
        :label="panels.layers"
        :ui="panelTabsUI"
      >
        <template #option="{ option }">
          <span v-test-id="panelTestIds[option.value] ?? 'left-panel-layers-tab'" class="truncate">
            {{ option.label }}
          </span>
        </template>
      </SegmentedControl>
    </div>
    <AssetsPanel v-if="activePanel === 'assets'" />
    <ScreensPanel v-else-if="activePanel === 'screens'" />
    <SplitterGroup
      v-else
      direction="vertical"
      auto-save-id="layers-layout"
      class="flex-1 overflow-hidden"
    >
      <SplitterPanel
        :default-size="30"
        :min-size="10"
        :max-size="60"
        class="flex flex-col overflow-hidden"
      >
        <PagesPanel />
      </SplitterPanel>
      <SplitterResizeHandle :class="splitterStyles.handle()">
        <div :class="splitterStyles.divider()" />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="70" :min-size="20" class="flex flex-col overflow-hidden">
        <header
          data-test-id="layers-header"
          class="shrink-0 px-3 py-2 text-2xs font-semibold text-surface"
        >
          {{ panels.layers }}
        </header>
        <!-- A screen is a page of the running application, and its elements are its layers. -->
        <LiveLayersSection v-if="liveNodeId" :node-id="liveNodeId" />
        <LayerTree data-test-id="layers-tree" />
      </SplitterPanel>
    </SplitterGroup>
  </aside>
</template>
