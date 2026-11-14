import { expect, test } from 'bun:test'

import { asDouble } from '@open-pencil/test-support/doubles'

import type { ScreenResizer } from '@/app/live-pages/widths'
import { nearestScreenWidth, resizeScreen, widthKind } from '@/app/live-pages/widths'

test('a frame is shown at the width of the device its own width is nearest', () => {
  expect(widthKind(1440)).toBe('desktop')
  expect(widthKind(1280)).toBe('desktop')
  expect(widthKind(768)).toBe('tablet')
  expect(widthKind(800)).toBe('tablet')
  expect(widthKind(390)).toBe('phone')
  expect(widthKind(360)).toBe('phone')
})

test('the width a person picked is the one a frame is closest to', () => {
  expect(nearestScreenWidth(1400)).toBe(1440)
  expect(nearestScreenWidth(900)).toBe(768)
  expect(nearestScreenWidth(420)).toBe(390)
  expect(nearestScreenWidth(0)).toBe(390)
})

test('resizing a screen is one undoable edit that keeps its height', () => {
  const edits: { nodeId: string; changes: Record<string, unknown>; label: string }[] = []
  const resizer = asDouble<ScreenResizer>({
    updateNodeWithUndo: (nodeId: string, changes: Record<string, unknown>, label: string) => {
      edits.push({ nodeId, changes, label })
    }
  })

  resizeScreen(resizer, 'frame-a', 390)

  expect(edits).toEqual([{ nodeId: 'frame-a', changes: { width: 390 }, label: 'Resize screen' }])
})
