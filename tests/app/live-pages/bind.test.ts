import { expect, test } from 'bun:test'

import type { SceneNode } from '@open-pencil/scene-graph'
import { OPEN_PENCIL_PLUGIN_DATA } from '@open-pencil/scene-graph/plugin-data'

import {
  readDocumentProject,
  writeDocumentProject,
  type DocumentProject,
  type ProjectBindingEditor
} from '@/app/live-pages/bind'

/** A document with one root layer, which is where a document's own records live. */
function document() {
  const root = { id: 'root', pluginData: [] } as unknown as SceneNode
  const edits: { nodeId: string; label: string }[] = []
  const editor: ProjectBindingEditor = {
    graph: { rootId: 'root', getNode: (id: string) => (id === 'root' ? root : undefined) } as never,
    updateNodeWithUndo: (nodeId, changes, label) => {
      edits.push({ nodeId, label })
      Object.assign(root as unknown as { pluginData: unknown }, changes)
    }
  }
  return { editor, edits, root }
}

const karbid: DocumentProject = { projectId: 'project-abc', repository: 'D:/Karbid2' }

test('a connected document keeps the project it belongs to', () => {
  const { editor, root } = document()

  writeDocumentProject(editor, karbid)

  expect(readDocumentProject(editor)).toEqual(karbid)
  // The record lives on the document's own root, beside everything else it carries.
  const stored = (root.pluginData as { key: string }[]).map((entry) => entry.key)
  expect(stored).toContain(OPEN_PENCIL_PLUGIN_DATA.documentProject.key)
})

test('disconnecting takes the record away rather than blanking it', () => {
  const { editor, root } = document()
  writeDocumentProject(editor, karbid)

  writeDocumentProject(editor, null)

  expect(readDocumentProject(editor)).toBeNull()
  expect(root.pluginData).toHaveLength(0)
})

test('a document that was never connected names no project', () => {
  const { editor } = document()

  expect(readDocumentProject(editor)).toBeNull()
})

test('a record another build wrote is not half read', () => {
  const { editor, root } = document()
  ;(root as unknown as { pluginData: unknown[] }).pluginData = [
    {
      pluginId: OPEN_PENCIL_PLUGIN_DATA.documentProject.pluginId,
      key: OPEN_PENCIL_PLUGIN_DATA.documentProject.key,
      value: { projectId: '' }
    }
  ]

  expect(readDocumentProject(editor)).toBeNull()
})

test('connecting is one undoable edit a person can read in the history', () => {
  const { editor, edits } = document()

  writeDocumentProject(editor, karbid)

  expect(edits).toEqual([{ nodeId: 'root', label: 'Connect project' }])
})
