import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'
import { OPEN_PENCIL_PLUGIN_DATA, withPluginData } from '@open-pencil/scene-graph/plugin-data'
import { asDouble } from '@open-pencil/test-support/doubles'

import {
  applyElementToCode,
  elementInstruction,
  screenOfFrame,
  type ApplyElementDeps,
  type ApplyElementEditor
} from '@/app/live-pages/apply'
import type { ScreenCopy } from '@/app/live-pages/copies'
import { pluginDataWithScreenCopy } from '@/app/live-pages/copies'

const copy: ScreenCopy = {
  branch: 'op/sales-pricing-2026-11-14',
  path: 'D:/work/sales-pricing-2026-11-14.copy',
  createdAt: '2026-11-14T10:00:00.000Z'
}

const element = {
  selector: 'button.rp-button',
  componentFile: '/app/components/SaveButton.vue',
  changed: 'padding: 4px 8px'
}

/** A document with one frame that shows a page of the running application. */
function document(options: { copy?: ScreenCopy } = {}) {
  const graph = new SceneGraph()
  const [page] = graph.getPages()
  if (!page) throw new Error('a new document has a page')
  const node = graph.createNode('FRAME', page.id, { name: 'Pricing', width: 1440, height: 900 })
  let pluginData = withPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.livePage, {
    url: 'http://localhost:3000/pricing',
    mode: 'live'
  })
  if (options.copy) pluginData = pluginDataWithScreenCopy({ ...node, pluginData }, options.copy)
  graph.updateNode(node.id, { pluginData })

  const edits: { nodeId: string; label: string | undefined }[] = []
  const editor: ApplyElementEditor = {
    graph: {
      getNode: (id: string) => graph.getNode(id)
    },
    updateNodeWithUndo: (nodeId, changes, label) => {
      edits.push({ nodeId, label })
      graph.updateNode(nodeId, changes)
    }
  }
  return { graph, editor, nodeId: node.id, edits }
}

/** The outside of a hand-over: the branches, and the copy that is made. */
function deps(made: 'ok' | 'failed' = 'ok') {
  const created: { repository: string; path: string; branches: string[] }[] = []
  const listed: string[] = []
  const outside: ApplyElementDeps = {
    listBranches: async () => {
      listed.push('asked')
      return ['main', 'op/sales-pricing-2026-11-14']
    },
    createCopy: asDouble<ApplyElementDeps['createCopy']>(async (repository: string, screen: { path: string }, taken: readonly string[]) => {
      created.push({ repository, path: screen.path, branches: [...taken] })
      return made === 'ok' ? { ok: true, value: copy } : { ok: false, error: 'git refused' }
    })
  }
  return { outside, created, listed }
}

describe('the screen a frame shows', () => {
  test('is named by its path, its address, and the area it belongs to', () => {
    const { editor, nodeId } = document()

    const node = editor.graph.getNode(nodeId)
    if (node === undefined) throw new Error('the fixture frame must exist')
    const screen = screenOfFrame(node)

    expect(screen?.path).toBe('/pricing')
    expect(screen?.url).toBe('http://localhost:3000/pricing')
    expect(screen?.name).toBe('Pricing')
    expect(screen?.nodeId).toBe(nodeId)
  })

  test('is nothing at all for a frame that draws its own layers', () => {
    const graph = new SceneGraph()
    const [page] = graph.getPages()
    if (page === undefined) throw new Error('a new document has a page')
    const node = graph.createNode('FRAME', page.id, { name: 'Plain' })

    expect(screenOfFrame(node)).toBeNull()
  })
})

describe('what the agent is asked to change', () => {
  test('the element, the component that rendered it, and the values', () => {
    const instruction = elementInstruction(element)

    expect(instruction).toContain('`button.rp-button`')
    expect(instruction).toContain('padding: 4px 8px')
    expect(instruction).toContain('/app/components/SaveButton.vue')
  })

  test('no component file leaves that sentence out', () => {
    const instruction = elementInstruction({ ...element, componentFile: null })

    expect(instruction).not.toContain('rendered by')
  })
})

describe('handing an element change to the agent', () => {
  test('a screen with a copy uses it, and nothing is created', async () => {
    const { editor, nodeId } = document({ copy })
    const { outside, created, listed } = deps()

    const applied = await applyElementToCode(
      editor,
      { repository: 'D:/work', nodeId, element },
      outside
    )

    expect(created).toEqual([])
    expect(listed).toEqual([])
    expect(applied?.copy).toEqual(copy)
    expect(applied?.prompt).toContain(copy.path)
    expect(applied?.prompt).toContain('button.rp-button')
  })

  test('a screen without a copy is given one, as one undoable edit', async () => {
    const { editor, nodeId, edits } = document()
    const { outside, created } = deps()

    const applied = await applyElementToCode(
      editor,
      { repository: 'D:/work', nodeId, element },
      outside
    )

    expect(created).toHaveLength(1)
    expect(created[0]?.repository).toBe('D:/work')
    // The copy needs the branches it could collide with, which are read before it is made.
    expect(created[0]?.branches).toContain('main')
    expect(edits).toEqual([{ nodeId, label: 'Make a copy' }])
    expect(applied?.copy).toEqual(copy)
  })

  test('a copy git refuses leaves the change where it was', async () => {
    const { editor, nodeId } = document()
    const { outside } = deps('failed')

    expect(
      await applyElementToCode(editor, { repository: 'D:/work', nodeId, element }, outside)
    ).toBeNull()
  })

  test('a document outside every project has nowhere to hand a change', async () => {
    const { editor, nodeId } = document()

    expect(
      await applyElementToCode(editor, { repository: null, nodeId, element }, deps().outside)
    ).toBeNull()
  })
})
