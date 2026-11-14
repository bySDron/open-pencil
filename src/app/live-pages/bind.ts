import type { Editor } from '@open-pencil/core'
import {
  documentProjectSchema,
  isPluginDataEntry,
  OPEN_PENCIL_PLUGIN_DATA,
  withPluginData
} from '@open-pencil/scene-graph/plugin-data'
import * as v from 'valibot'

/** The project a document belongs to, as the document keeps it. */
export type DocumentProject = v.InferOutput<typeof documentProjectSchema>

/** What connecting a document to a project needs: its graph, and an edit that can be undone. */
export type ProjectBindingEditor = Pick<Editor, 'graph' | 'updateNodeWithUndo'>

const projectField = OPEN_PENCIL_PLUGIN_DATA.documentProject

/**
 * The project the open document belongs to, kept on its root layer beside the statuses and
 * baselines it already carries. A document that names a project stays connected to it wherever
 * it is saved, which is what lets the screens panel find its application without asking where
 * the file lives. A record written by another version is ignored rather than half read.
 */
export function readDocumentProject(editor: Pick<Editor, 'graph'>): DocumentProject | null {
  const root = editor.graph.getNode(editor.graph.rootId)
  if (!root) return null
  const stored = root.pluginData.find((entry) => isPluginDataEntry(entry, projectField))?.value
  if (stored === undefined) return null
  const parsed = v.safeParse(
    v.pipe(v.string(), v.parseJson(), documentProjectSchema),
    stored
  )
  return parsed.success ? parsed.output : null
}

/**
 * Connect the document to a project, or disconnect it with null, as one undoable edit: connecting
 * is what the screens panel does when it is given a folder, and undoing it brings back the project
 * the document came from.
 */
export function writeDocumentProject(
  editor: ProjectBindingEditor,
  project: DocumentProject | null
): void {
  const root = editor.graph.getNode(editor.graph.rootId)
  if (!root) return
  editor.updateNodeWithUndo(
    root.id,
    { pluginData: withPluginData(root.pluginData, projectField, project ?? undefined) },
    project === null ? 'Disconnect project' : 'Connect project'
  )
}
