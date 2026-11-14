import { afterEach, expect, test } from 'bun:test'

import { setActiveEditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'
import { useLivePages } from '@/app/live-pages/use'

/**
 * Whether a screen runs on the canvas or is drawn as its picture.
 *
 * A live page is its own application; a picture is an image. The choice is the frame's, kept on the
 * document, so it travels with the file like any other edit.
 */

const stores: ReturnType<typeof createEditorStore>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose()
})

function openDocument() {
  const store = createEditorStore()
  stores.push(store)
  setActiveEditorStore(store)
  return store
}

test('a screen shown as a picture runs when it is asked for live, and stops again', () => {
  const store = openDocument()
  const live = useLivePages()
  const id = store.createShape('FRAME', 0, 0, 1440, 900, store.state.currentPageId, 'Home')
  live.setPage(id, { url: 'http://localhost:3000', label: 'Home', mode: 'snapshot' })

  live.setMode(id, 'live')

  expect(live.pageOf(id)?.mode).toBe('live')

  live.setMode(id, 'snapshot')

  expect(live.pageOf(id)?.mode).toBe('snapshot')
})

test('a frame that shows no page has no mode to change', () => {
  const store = openDocument()
  const live = useLivePages()
  const id = store.createShape('FRAME', 0, 0, 100, 100, store.state.currentPageId, 'Plain')

  expect(() => live.setMode(id, 'live')).not.toThrow()

  expect(live.pageOf(id)).toBeNull()
})
