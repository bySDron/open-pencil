import type { SceneNode } from '@open-pencil/scene-graph'
import {
  OPEN_PENCIL_PLUGIN_DATA,
  readPluginData,
  withPluginData
} from '@open-pencil/scene-graph/plugin-data'

import {
  addWorktree,
  runGit,
  type GitOutcome,
  type GitTransport
} from '@/app/integrations/git/client'

import type { Screen } from './screens'

/** The branch a screen's copy lives on, as its frame records it. */
export type ScreenCopy = {
  branch: string
  /** The folder the branch is checked out in, which is where work on that screen happens. */
  path: string
  /** An ISO 8601 timestamp. */
  createdAt: string
}

/** Every copy's branch sits under one prefix, so they read as copies in a branch list. */
export const COPY_BRANCH_PREFIX = 'op/'

/** One word of a branch name: lowercase ASCII, dashes between words, nothing else. */
function slug(words: string): string {
  return words
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

/** The last segment of a path, which names a screen whose own name has no ASCII in it. */
function lastSegment(path: string): string {
  return path.split('/').findLast((segment) => segment !== '') ?? ''
}

/**
 * The branch a copy of a screen takes: the part of the address it sits in, its name, and the day
 * it was made, so two copies made on one day stay apart. A name with nothing git can read — a
 * screen named in another script — falls back to its path.
 */
export function copyBranchName(
  screen: Pick<Screen, 'area' | 'name' | 'path'>,
  taken: readonly string[] = [],
  today = new Date()
): string {
  const words = [slug(screen.area), slug(screen.name) || slug(lastSegment(screen.path))]
  const named = words.filter((word) => word !== '').join('-')
  const base = `${COPY_BRANCH_PREFIX}${named === '' ? 'screen' : named}-${today.toISOString().slice(0, 10)}`
  let branch = base
  for (let count = 2; taken.includes(branch); count += 1) branch = `${base}-${count}`
  return branch
}

/**
 * The folder a copy is checked out in: beside the repository, named after its branch, so git never
 * sees the copy inside the tree it belongs to and a person's own checkout stays where it is.
 */
export function copyWorktreePath(repository: string, branch: string): string {
  const slug = branch.split('/').findLast((segment) => segment !== '') ?? 'copy'
  const parent = repository
    .replaceAll(/[\\/]+$/g, '')
    .split(/[\\/]/)
    .slice(0, -1)
    .join('/')
  return `${parent === '' ? '.' : parent}/${slug}.copy`
}

/**
 * Make the folder a screen's copy lives in: its branch, made without switching to it, and a
 * checkout of that branch beside the repository, where an agent works on that screen alone.
 */
export async function createScreenCopy(
  repository: string,
  screen: Screen,
  taken: readonly string[] = [],
  transport?: GitTransport
): Promise<GitOutcome<ScreenCopy>> {
  const branch = copyBranchName(screen, taken)
  const path = copyWorktreePath(repository, branch)
  // A transport is named only by tests; the panel lets `runGit` reach the desktop's gateway.
  const made = await runGit(repository, 'branch', [branch], transport)
  if (!made.ok) return made
  const checkedOut = await addWorktree(repository, path, branch, transport)
  return checkedOut.ok
    ? { ok: true, value: { branch, path, createdAt: new Date().toISOString() } }
    : checkedOut
}

/** The copy a frame belongs to, or null while it has none. */
export function readScreenCopy(node: SceneNode): ScreenCopy | null {
  return readPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.screenCopy) ?? null
}

/** The plugin data that puts a frame in `copy`, or that takes it out of one for null. */
export function pluginDataWithScreenCopy(node: SceneNode, copy: ScreenCopy | null) {
  return withPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.screenCopy, copy ?? undefined)
}

/**
 * What the chat is asked to do for one screen: change the page its frame shows, in the copy's own
 * folder, and leave every other screen alone. Written for the agent, so it stays in English.
 */
export function screenTaskPrompt(screen: Screen, copy: ScreenCopy): string {
  return [
    `Work only inside this folder: ${copy.path}`,
    `It is a copy of the application's screen "${screen.name}" (${screen.path}) on branch ${copy.branch}.`,
    'Change what that screen needs, and nothing else: no other screen and no shared layout unless',
    'the screen cannot be fixed without it — if that is the case, say so before changing it.',
    'When you are done, summarize what changed in a few lines.'
  ].join('\n')
}
