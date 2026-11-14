import { expect, test } from 'bun:test'

import type { GitTransport } from '@/app/integrations/git/client'
import {
  bringCopyChanges,
  copyChanges,
  copyDiff,
  discardCopyChanges
} from '@/app/live-pages/copy-changes'

/** A git that answers what a test tells it to, and records what it was asked. */
function git(answer: { stdout?: string; code?: number; failOn?: string } = {}) {
  const calls: { repo: string; subcommand: string; args: string[] }[] = []
  const transport: GitTransport = (_command, args) => {
    const request = args as { repo: string; subcommand: string; args: string[] }
    calls.push({ repo: request.repo, subcommand: request.subcommand, args: request.args })
    if (request.subcommand === answer.failOn) {
      return Promise.resolve({ code: 1, stdout: '', stderr: 'refused' })
    }
    return Promise.resolve({ code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: '' })
  }
  return { calls, transport }
}

test('the files a copy has changed are read from git’s own porcelain', async () => {
  const { calls, transport } = git({
    stdout: ' M packages/ui/button.vue\n?? packages/ui/new.vue\nA  packages/ui/added.vue\n'
  })

  const changes = await copyChanges('D:/work/copy', transport)

  expect(changes).toEqual([
    { status: ' M', path: 'packages/ui/button.vue' },
    { status: '??', path: 'packages/ui/new.vue' },
    { status: 'A ', path: 'packages/ui/added.vue' }
  ])
  expect(calls).toEqual([{ repo: 'D:/work/copy', subcommand: 'status', args: ['--porcelain'] }])
})

test('a copy nobody has touched answers no files rather than a failure', async () => {
  expect(await copyChanges('D:/work/copy', git({ stdout: '' }).transport)).toEqual([])
})

test('a copy git cannot read answers no files either, so the panel stays quiet', async () => {
  expect(await copyChanges('D:/work/copy', git({ code: 128, stdout: '' }).transport)).toEqual([])
})

test('the diff of one file is what the panel shows', async () => {
  const { calls, transport } = git({
    stdout: 'diff --git a/button.vue b/button.vue\n-  padding: 8px;\n+  padding: 4px;\n'
  })

  const diff = await copyDiff('D:/work/copy', 'button.vue', transport)

  expect(diff).toContain('+  padding: 4px;')
  expect(diff.startsWith('diff --git')).toBe(true)
  expect(calls).toEqual([{ repo: 'D:/work/copy', subcommand: 'diff', args: ['--', 'button.vue'] }])
})

test('a diff git refuses is empty rather than half a patch', async () => {
  expect(await copyDiff('D:/work/copy', 'button.vue', git({ code: 1 }).transport)).toBe('')
})

test('dropping every change of a copy is one checkout of the folder', async () => {
  const { calls, transport } = git()

  expect(await discardCopyChanges('D:/work/copy', transport)).toBe(true)

  expect(calls).toEqual([{ repo: 'D:/work/copy', subcommand: 'checkout', args: ['--', '.'] }])
})

test('a checkout git refuses is reported, so the panel can say the work stays', async () => {
  expect(await discardCopyChanges('D:/work/copy', git({ code: 1 }).transport)).toBe(false)
})

test('bringing a copy’s work home commits it there and checks the files out here', async () => {
  const { calls, transport } = git({ stdout: ' M a/b.vue\n?? c.vue\n' })

  const brought = await bringCopyChanges(
    'D:/work',
    'D:/work/copy',
    'op/sales-2026-11-14',
    'Take the screen’s changes',
    transport
  )

  expect(brought).toEqual({ ok: true, files: ['a/b.vue', 'c.vue'] })
  // The work is uncommitted in the copy: it is committed on the copy's branch, then checked out.
  expect(calls).toEqual([
    { repo: 'D:/work/copy', subcommand: 'status', args: ['--porcelain'] },
    { repo: 'D:/work/copy', subcommand: 'add', args: ['-A'] },
    { repo: 'D:/work/copy', subcommand: 'commit', args: ['-m', 'Take the screen’s changes'] },
    {
      repo: 'D:/work',
      subcommand: 'checkout',
      args: ['op/sales-2026-11-14', '--', 'a/b.vue', 'c.vue']
    }
  ])
})

test('a copy with nothing changed has nothing to bring home', async () => {
  const { calls, transport } = git({ stdout: '' })

  expect(await bringCopyChanges('D:/work', 'D:/work/copy', 'op/x', 'msg', transport)).toEqual({
    ok: false,
    reason: 'nothing'
  })
  expect(calls).toHaveLength(1)
})

test('a commit the copy refuses stops before anything reaches the working tree', async () => {
  const { calls, transport } = git({ stdout: ' M a.vue\n', failOn: 'commit' })

  expect(await bringCopyChanges('D:/work', 'D:/work/copy', 'op/x', 'msg', transport)).toEqual({
    ok: false,
    reason: 'commit'
  })
  expect(calls.map((call) => call.subcommand)).toEqual(['status', 'add', 'commit'])
})

test('a checkout the repository refuses is reported rather than claimed', async () => {
  const { transport } = git({ stdout: ' M a.vue\n', failOn: 'checkout' })

  expect(await bringCopyChanges('D:/work', 'D:/work/copy', 'op/x', 'msg', transport)).toEqual({
    ok: false,
    reason: 'checkout'
  })
})
