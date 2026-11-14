import { expect, test } from 'bun:test'

import type { SceneNode } from '@open-pencil/scene-graph'
import { asDouble } from '@open-pencil/test-support/doubles'

import {
  readDocumentProject,
  writeDocumentProject,
  type DocumentProject,
  type ProjectBindingEditor
} from '@/app/live-pages/bind'

/** A document with one root layer, which is where a document's own records live. */
function document() {
  const holder = { root: { id: 'root', pluginData: [] as unknown[] } }
  const edits: { nodeId: string; label: string | undefined }[] = []
  const editor = asDouble<ProjectBindingEditor>({
    graph: {
      rootId: 'root',
      getNode: (id: string) => (id === 'root' ? asDouble<SceneNode>(holder.root) : undefined)
    },
    updateNodeWithUndo: (nodeId: string, changes: object, label: string | undefined) => {
      edits.push({ nodeId, label })
      Object.assign(holder.root, changes)
    }
  })
  return { editor, edits, root: holder.root }
}

const karbid: DocumentProject = { projectId: 'project-abc', repository: 'D:/Karbid2' }

test('a connected document keeps the project it belongs to', () => {
  const { editor, root } = document()

  writeDocumentProject(editor, karbid)

  expect(readDocumentProject(editor)).toEqual(karbid)
  // The record lives on the document's own root, beside everything else it carries.
  const stored = (root.pluginData as { key: string }[]).map((entry) => entry.key)
  expect(stored).toContain('documentProject')
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
  root.pluginData = [
    {
      pluginId: 'open-pencil',
      key: 'documentProject',
      // The value is the JSON text the writer stores; one that is not an entry reads as none.
      value: '{"projectId":""}'
    }
  ]

  expect(readDocumentProject(editor)).toBeNull()
})

test('connecting is one undoable edit a person can read in the history', () => {
  const { editor, edits } = document()

  writeDocumentProject(editor, karbid)

  expect(edits).toEqual([{ nodeId: 'root', label: 'Connect project' }])
})
