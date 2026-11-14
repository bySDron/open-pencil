import type { SceneNode } from '@open-pencil/scene-graph'
import {
  OPEN_PENCIL_PLUGIN_DATA,
  readPluginData,
  withPluginData
} from '@open-pencil/scene-graph/plugin-data'

import { runGit, type GitOutcome, type GitTransport } from '@/app/integrations/git/client'

import type { Screen } from './screens'

/** The branch a screen's copy lives on, as its frame records it. */
export type ScreenCopy = {
  branch: string
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
 * Make the branch a screen's copy lives on. The branch is made without switching to it, so the
 * work a person is doing in the repository stays where it is, and the copy is a place beside it.
 */
export async function createScreenCopy(
  repository: string,
  screen: Screen,
  taken: readonly string[] = [],
  transport?: GitTransport
): Promise<GitOutcome<ScreenCopy>> {
  const branch = copyBranchName(screen, taken)
  // A transport is named only by tests; the panel lets `runGit` reach the desktop's gateway.
  const made = await runGit(repository, 'branch', [branch], transport)
  return made.ok ? { ok: true, value: { branch, createdAt: new Date().toISOString() } } : made
}

/** The copy a frame belongs to, or null while it has none. */
export function readScreenCopy(node: SceneNode): ScreenCopy | null {
  return readPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.screenCopy) ?? null
}

/** The plugin data that puts a frame in `copy`, or that takes it out of one for null. */
export function pluginDataWithScreenCopy(node: SceneNode, copy: ScreenCopy | null) {
  return withPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.screenCopy, copy ?? undefined)
}
