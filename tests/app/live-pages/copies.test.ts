import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

import type { GitTransport } from '@/app/integrations/git/client'
import {
  COPY_BRANCH_PREFIX,
  copyBranchName,
  createScreenCopy,
  pluginDataWithScreenCopy,
  readScreenCopy
} from '@/app/live-pages/copies'
import type { Screen } from '@/app/live-pages/screens'

const DAY = new Date('2026-11-14T10:00:00.000Z')

function screen(overrides: Partial<Screen> = {}): Screen {
  return {
    nodeId: 'frame',
    path: '/pricing',
    url: 'http://localhost:3000/pricing',
    name: 'Pricing',
    area: 'sales',
    areaTitle: 'sales',
    status: null,
    changed: false,
    ...overrides
  }
}

describe('the branch a copy takes', () => {
  test('the area, the name, and the day it was made', () => {
    expect(copyBranchName(screen(), [], DAY)).toBe(`${COPY_BRANCH_PREFIX}sales-pricing-2026-11-14`)
  })

  test('a screen at the root is named by itself', () => {
    expect(copyBranchName(screen({ area: '', name: 'Home', path: '/' }), [], DAY)).toBe(
      `${COPY_BRANCH_PREFIX}home-2026-11-14`
    )
  })

  test('a name with nothing git can read falls back to the path', () => {
    expect(copyBranchName(screen({ name: 'Тарифы' }), [], DAY)).toBe(
      `${COPY_BRANCH_PREFIX}sales-pricing-2026-11-14`
    )
  })

  test('a name already taken gains a number, so two copies stay apart', () => {
    const first = copyBranchName(screen(), [], DAY)
    expect(copyBranchName(screen(), [first], DAY)).toBe(`${first}-2`)
    expect(copyBranchName(screen(), [first, `${first}-2`], DAY)).toBe(`${first}-3`)
  })

  test('spaces and slashes become dashes', () => {
    expect(copyBranchName(screen({ area: 'my area', name: 'Billing history' }), [], DAY)).toBe(
      `${COPY_BRANCH_PREFIX}my-area-billing-history-2026-11-14`
    )
  })
})

describe('a frame’s copy', () => {
  test('is written to the frame and read back', () => {
    const graph = new SceneGraph()
    const [page] = graph.getPages()
    if (!page) throw new Error('a new document has a page')
    const node = graph.createNode('FRAME', page.id, { name: 'Pricing' })
    const copy = { branch: 'op/sales-pricing-2026-11-14', createdAt: DAY.toISOString() }

    graph.updateNode(node.id, { pluginData: pluginDataWithScreenCopy(node, copy) })

    const written = graph.getNode(node.id)
    expect(written ? readScreenCopy(written) : null).toEqual(copy)
  })

  test('goes away when the frame leaves its copy', () => {
    const graph = new SceneGraph()
    const [page] = graph.getPages()
    if (!page) throw new Error('a new document has a page')
    const node = graph.createNode('FRAME', page.id, {
      pluginData: [
        {
          pluginId: 'open-pencil',
          key: 'livePage',
          value: '{"url":"http://localhost:3000","mode":"live"}'
        }
      ]
    })
    const withCopy = pluginDataWithScreenCopy(node, {
      branch: 'op/x',
      createdAt: DAY.toISOString()
    })
    const without = pluginDataWithScreenCopy({ ...node, pluginData: withCopy }, null)

    expect(without.map((entry) => entry.key)).toEqual(['livePage'])
  })
})

describe('making a copy', () => {
  function recording() {
    const calls: { subcommand: string; args: string[] }[] = []
    const transport: GitTransport = (_command, args) => {
      const request = args as { subcommand: string; args: string[] }
      calls.push({ subcommand: request.subcommand, args: request.args })
      return Promise.resolve({ code: 0, stdout: '', stderr: '' })
    }
    return { calls, transport }
  }

  test('a copy is a branch made beside the current one, named after the screen', async () => {
    const { calls, transport } = recording()

    const made = await createScreenCopy(
      '/repo',
      screen(),
      ['op/sales-pricing-2026-11-14'],
      transport
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.subcommand).toBe('branch')
    expect(calls[0]?.args[0]).toMatch(/^op\/sales-pricing-\d{4}-\d{2}-\d{2}-2$/)
    expect(made.ok ? made.value.branch : '').toMatch(/-2$/)
  })

  test('a branch git refuses is a failure, not a copy', async () => {
    const transport: GitTransport = () =>
      Promise.resolve({ code: 128, stdout: '', stderr: 'fatal: not a git repository' })

    expect((await createScreenCopy('/repo', screen(), [], transport)).ok).toBe(false)
  })
})
