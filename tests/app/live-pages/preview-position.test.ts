import { afterEach, expect, test } from 'bun:test'

import { setActiveEditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'

/** Does a layer moved through a drag preview report its new place to a reader? */

const stores: ReturnType<typeof createEditorStore>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose()
})

test('a previewed position is what a reader of the graph sees', () => {
  const store = createEditorStore()
  stores.push(store)
  setActiveEditorStore(store)
  const section = store.createShape('SECTION', 100, 200, 800, 600, store.state.currentPageId, 'area')
  const frame = store.createShape('FRAME', 140, 240, 400, 300, section, 'screen')

  const before = store.graph.getAbsolutePosition(frame)
  store.graph.updateNodePreview(frame, { x: 540, y: 640 })
  const after = store.graph.getAbsolutePosition(frame)

  expect(before).toEqual({ x: 240, y: 440 })
  expect(after).toEqual({ x: 640, y: 840 })
})
