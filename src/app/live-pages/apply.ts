import type { PluginDataEntry, SceneNode } from '@open-pencil/scene-graph'

import { areaOf, areaTitle } from './areas'
import {
  pluginDataWithScreenCopy,
  readScreenCopy,
  screenTaskPrompt,
  type createScreenCopy,
  type ScreenCopy
} from './copies'
import { readLivePage } from './schema'
import type { Screen } from './screens'

/**
 * Handing a change made on a live page to the agent, in a copy of the screen it belongs to.
 *
 * A screen's copy is a branch and a folder beside the repository, so the work lands somewhere a
 * person can compare and throw away. A screen that has none gets one at the moment it is edited -
 * asking first would be a second press for the same decision - and the task names the element, the
 * component that rendered it, and the values the panel changed.
 */

/** The image of a hand-over: the branches, and the copy that is made. */
export type ApplyElementDeps = {
  /** The branches of the repository, so a new copy's name does not collide with one. */
  listBranches: (repository: string) => Promise<string[]>
  /** Make a branch and a folder for a screen. */
  createCopy: (
    repository: string,
    screen: Screen,
    taken: readonly string[]
  ) => ReturnType<typeof createScreenCopy>
}

/** What an edit of the canvas needs: its graph, and an edit that can be undone. */
export type ApplyElementEditor = {
  graph: { getNode: (id: string) => SceneNode | undefined }
  updateNodeWithUndo: (
    nodeId: string,
    changes: { pluginData: PluginDataEntry[] },
    label?: string
  ) => void
}

/** The screen a frame shows, as the panel names one. */
export function screenOfFrame(node: SceneNode): Screen | null {
  const page = readLivePage(node)
  if (page === null) return null
  const area = areaOf(pathOfAddress(page.url))
  return {
    nodeId: node.id,
    path: pathOfAddress(page.url),
    url: page.url,
    name: node.name,
    area,
    areaTitle: areaTitle(area),
    status: null,
    changed: false
  }
}

/** The path an address serves, or the address itself when it cannot be read as one. */
function pathOfAddress(url: string): string {
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(url.trim())
  return parsed?.[1] ?? url
}
/** What the element edit asks of the agent, in the words the agent reads. */
export function elementInstruction(element: {
  selector: string
  componentFile: string | null
  changed: string
}): string {
  const lines = [
    `The element \`${element.selector}\` was changed in the browser to: ${element.changed}.`,
    element.componentFile === null
      ? ''
      : `The page reports it is rendered by \`${element.componentFile}\`.`,
    'Make that change in the element’s own source, and only there: a style or a class of that element, not a global one.',
    'Say which file you changed and why the element you picked is that one.'
  ]
  return lines.filter((line) => line !== '').join(' ')
}

/** What handing a change over produced: the copy the work lands in, and the task to send. */
export type AppliedElement = { copy: ScreenCopy; prompt: string }

/**
 * The copy of a screen, made when the screen has none. A copy that cannot be made answers null,
 * which the panel explains with the words it already has for a refused copy.
 */
async function copyOfScreen(
  editor: ApplyElementEditor,
  node: SceneNode,
  repository: string,
  deps: ApplyElementDeps
): Promise<ScreenCopy | null> {
  const existing = readScreenCopy(node)
  if (existing !== null) return existing
  const screen = screenOfFrame(node)
  if (screen === null) return null
  const made = await deps.createCopy(repository, screen, await deps.listBranches(repository))
  if (!made.ok) return null
  editor.updateNodeWithUndo(
    node.id,
    { pluginData: pluginDataWithScreenCopy(node, made.value) },
    'Make a copy'
  )
  return made.value
}

/**
 * Hand one element's change to the agent in the screen's own copy: the copy is made when the screen
 * has none, and the task names the element, its component, and what changed.
 */
export async function applyElementToCode(
  editor: ApplyElementEditor,
  options: {
    repository: string | null
    nodeId: string
    element: { selector: string; componentFile: string | null; changed: string }
  },
  deps: ApplyElementDeps
): Promise<AppliedElement | null> {
  const repository = options.repository
  if (repository === null) return null
  const node = editor.graph.getNode(options.nodeId)
  if (node === undefined) return null
  const copy = await copyOfScreen(editor, node, repository, deps)
  if (copy === null) return null
  const screen = screenOfFrame(node)
  if (screen === null) return null
  return {
    copy,
    prompt: `${screenTaskPrompt(screen, copy)}\n\n${elementInstruction(options.element)}`
  }
}
