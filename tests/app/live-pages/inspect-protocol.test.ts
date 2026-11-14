import { expect, test } from 'bun:test'

import {
  INSPECT_SOURCE,
  inspectRequest,
  readInspectMessage,
  type PageNode
} from '@/app/live-pages/inspect-protocol'

const node: PageNode = {
  id: '3',
  parentId: '1',
  depth: 2,
  tag: 'button',
  classes: ['rp-button', 'wide'],
  text: 'Save',
  rect: { x: 4, y: 8, width: 120, height: 40 },
  component: { name: 'SaveButton', file: '/app/components/SaveButton.vue' }
}

test('what a page reports is read back whole', () => {
  const tree = readInspectMessage({
    source: INSPECT_SOURCE,
    type: 'tree',
    payload: { nodes: [node] }
  })

  expect(tree).toEqual({ type: 'tree', nodes: [node] })
})

test('a picked element carries the values the page computes for it', () => {
  const picked = readInspectMessage({
    source: INSPECT_SOURCE,
    type: 'picked',
    payload: { pick: { node, styles: { 'font-size': '14px' } } }
  })

  expect(picked).toEqual({ type: 'picked', pick: { node, styles: { 'font-size': '14px' } } })
})

test('a change the page applied answers with the values it has now', () => {
  const styles = readInspectMessage({
    source: INSPECT_SOURCE,
    type: 'styles',
    payload: { styles: { padding: '4px' }, rect: node.rect }
  })

  expect(styles).toEqual({ type: 'styles', styles: { padding: '4px' }, rect: node.rect })
})

test('the page saying it is ready is its own message', () => {
  expect(readInspectMessage({ source: INSPECT_SOURCE, type: 'ready', payload: {} })).toEqual({
    type: 'ready'
  })
})

test('anything the page says that is not ours is not read', () => {
  for (const other of [
    null,
    'a string',
    { source: 'open-pencil', type: 'select', payload: {} },
    { source: INSPECT_SOURCE, type: 'tree', payload: { nodes: [{ tag: 'div' }] } },
    { source: INSPECT_SOURCE, type: 'picked', payload: { pick: null } }
  ]) {
    expect(readInspectMessage(other)).toBeNull()
  }
})

test('a request names the source the runtime listens for', () => {
  expect(JSON.parse(inspectRequest({ type: 'tree' }))).toEqual({
    source: 'open-pencil-host',
    type: 'tree'
  })
  expect(JSON.parse(inspectRequest({ type: 'style', key: 'padding', value: '4px' }))).toEqual({
    source: 'open-pencil-host',
    type: 'style',
    key: 'padding',
    value: '4px'
  })
})
