import { invoke } from '@tauri-apps/api/core'

import { runGit, type GitTransport } from '@/app/integrations/git/client'

/**
 * What an agent changed in a screen's copy.
 *
 * A copy is a branch and a folder of its own, so the work done there is a diff away from the branch
 * it came from: the panel lists the files that changed and shows one of them, and a change that is
 * not wanted is dropped before it reaches anything a person keeps.
 */

/** One file the copy has changed, as git reports it. */
export type CopyChange = {
  /** The path inside the copy. */
  path: string
  /** git's two-letter status: ` M` modified, `??` untracked, `A ` added, and so on. */
  status: string
}

/** How many lines of a diff the panel keeps, which is more than a screen's change ever needs. */
const DIFF_LINE_LIMIT = 400

/**
 * The files an agent changed in a copy, or the reason git could not be asked. A copy with nothing
 * changed answers an empty list rather than a failure: that is a screen nobody has touched yet.
 */
export async function copyChanges(
  copyPath: string,
  transport: GitTransport = invoke
): Promise<CopyChange[]> {
  const answer = await runGit(copyPath, 'status', ['--porcelain'], transport)
  if (!answer.ok) return []
  return answer.value.stdout
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.length > 3)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }))
}

/** The diff of one changed file in a copy, cut to what a panel can show. */
export async function copyDiff(
  copyPath: string,
  file: string,
  transport: GitTransport = invoke
): Promise<string> {
  const answer = await runGit(copyPath, 'diff', ['--', file], transport)
  if (!answer.ok) return ''
  return answer.value.stdout.split('\n').slice(0, DIFF_LINE_LIMIT).join('\n').trim()
}

/**
 * Throw away every change a copy holds, leaving the branch the copy was made from. This is the one
 * action that undoes an agent's work wholesale, so the panel asks before it runs.
 */
export async function discardCopyChanges(
  copyPath: string,
  transport: GitTransport = invoke
): Promise<boolean> {
  const answer = await runGit(copyPath, 'checkout', ['--', '.'], transport)
  return answer.ok
}

/** Why bringing a copy's work home produced nothing a person can use. */
export type BringFailure = 'nothing' | 'commit' | 'checkout'

/** What bringing a copy's work home did: the files it took, or why it took none. */
export type BringOutcome = { ok: true; files: string[] } | { ok: false; reason: BringFailure }

/**
 * Bring the work an agent did in a copy into the repository's working tree.
 *
 * A copy holds its work as uncommitted changes - the agent edits files, it does not commit - so the
 * work is committed on the copy's branch first, and the files are then checked out of that branch
 * into the working tree, where a person reviews and commits them like any other change. Nothing is
 * merged and no history is rewritten: a change nobody wants stays in the copy.
 */
export async function bringCopyChanges(
  repository: string,
  copyPath: string,
  branch: string,
  message: string,
  transport: GitTransport = invoke
): Promise<BringOutcome> {
  const changes = await copyChanges(copyPath, transport)
  if (changes.length === 0) return { ok: false, reason: 'nothing' }
  const staged = await runGit(copyPath, 'add', ['-A'], transport)
  if (!staged.ok) return { ok: false, reason: 'commit' }
  const committed = await runGit(copyPath, 'commit', ['-m', message], transport)
  if (!committed.ok) return { ok: false, reason: 'commit' }
  const files = changes.map((change) => change.path)
  const taken = await runGit(repository, 'checkout', [branch, '--', ...files], transport)
  return taken.ok ? { ok: true, files } : { ok: false, reason: 'checkout' }
}
