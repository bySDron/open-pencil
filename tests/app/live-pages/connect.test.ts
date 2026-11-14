import { expect, test } from 'bun:test'

import { computed } from 'vue'

import { asDouble } from '@open-pencil/test-support/doubles'

import { useScreensConnection, type ScreensConnectionIo } from '@/app/live-pages/connect'
import type { LivePagesSource } from '@/app/live-pages/open'
import type { RouteInfo } from '@/app/live-pages/routes'
import type { ProjectImportOutcome } from '@/app/projects/import'
import { createProject, type Project } from '@/app/projects/schema'

function project(repository: string, startCommand = 'vite', url = ''): Project {
  const created = createProject({ repository, startCommand, startUrl: url })
  if (created === null) throw new Error(`the fixture ${repository} must make a project`)
  return created
}

/** A source that records what the connection asked of it. */
function source(target: Project | null, routes: RouteInfo[] = []) {
  const bound: (Project | null)[] = []
  const opened: { address: string; count: number }[] = []
  const realigned: string[] = []
  const pages = asDouble<LivePagesSource>({
    project: computed(() => target),
    documentPath: computed(() => null),
    binding: computed(() => null),
    baseAddress: computed(() => target?.startUrl ?? ''),
    bind: (next: Project | null) => {
      bound.push(next)
    },
    listRoutes: async (): Promise<RouteInfo[]> => routes,
    realign: (address: string) => {
      realigned.push(address)
      return 0
    },
    openAll: (list: readonly RouteInfo[], address = '') => {
      opened.push({ address, count: list.length })
      return list.length
    }
  })
  return { pages, bound, opened, realigned }
}

/** The routes a project's page files declare, one page each. */
function routes(...paths: string[]): RouteInfo[] {
  return paths.map((path) => ({ route: path, file: `${path}.vue`, params: [] }))
}

function io(
  outcome: ProjectImportOutcome,
  answers: { address?: string; started?: Project[] } = {}
) {
  const connection: ScreensConnectionIo = {
    chooseProject: async () => outcome,
    startApplication: async (target) => {
      answers.started?.push(target)
    },
    waitForAddress: async () => answers.address ?? ''
  }
  return connection
}

/** The outside of a document that already names its project: nothing is ever chosen. */
function ioWithoutChoosing(address = ''): ScreensConnectionIo {
  return {
    chooseProject: async () => ({ kind: 'cancelled' }),
    startApplication: async () => undefined,
    waitForAddress: async () => address
  }
}

test('one folder connects a document to the screens of its application', async () => {
  const karbid = project('D:/Karbid2', 'pnpm dev')
  const { pages, bound, opened } = source(karbid, routes('/'))
  const started: Project[] = []
  const connection = useScreensConnection(
    pages,
    io({ kind: 'added', project: karbid }, { address: 'http://localhost:5173', started })
  )

  expect(await connection.connect()).toBe(true)

  expect(bound).toEqual([karbid])
  expect(started).toEqual([karbid])
  expect(opened).toEqual([{ address: 'http://localhost:5173', count: 1 }])
  expect(connection.phase.value).toBe('done')
  expect(connection.failure.value).toBeNull()
})

test('a folder that holds no repository says so and connects nothing', async () => {
  const { pages, bound } = source(null)
  const connection = useScreensConnection(pages, io({ kind: 'notRepository' }))

  expect(await connection.connect()).toBe(false)

  expect(bound).toEqual([])
  expect(connection.failure.value).toBe('not-repository')
  expect(connection.phase.value).toBe('failed')
})

test('a cancelled dialog changes nothing at all', async () => {
  const { pages, bound } = source(null)
  const connection = useScreensConnection(pages, io({ kind: 'cancelled' }))

  expect(await connection.connect()).toBe(false)

  expect(bound).toEqual([])
  expect(connection.failure.value).toBe('cancelled')
  expect(connection.phase.value).toBe('idle')
})

test('a project that names its own address falls back to it when nothing is announced', async () => {
  const ready = project('D:/ready', 'vite --port 4000', 'http://127.0.0.1:4000')
  const { pages, opened } = source(ready, routes('/'))
  let waited = 0
  const connection = useScreensConnection(pages, {
    chooseProject: async () => ({ kind: 'added', project: ready }),
    startApplication: async () => undefined,
    waitForAddress: async () => {
      waited += 1
      return ''
    }
  })

  expect(await connection.connect()).toBe(true)

  // The server's own announcement is asked for first: only it knows which loopback it bound.
  expect(waited).toBe(1)
  expect(opened).toEqual([{ address: 'http://127.0.0.1:4000', count: 1 }])
})

test('a server that never says its address is reported instead of guessed', async () => {
  const quiet = project('D:/quiet', 'vite')
  const { pages, opened } = source(quiet, routes('/'))
  const connection = useScreensConnection(pages, io({ kind: 'added', project: quiet }))

  expect(await connection.connect()).toBe(false)

  expect(opened).toEqual([])
  expect(connection.failure.value).toBe('no-address')
})

test('a project with no command to start anything asks the person to set one', async () => {
  const bare = project('D:/bare', '   ')
  const { pages, opened } = source(bare, routes('/'))
  const connection = useScreensConnection(pages, io({ kind: 'added', project: bare }))

  expect(await connection.connect()).toBe(false)

  expect(opened).toEqual([])
  expect(connection.failure.value).toBe('no-application')
})

test('a project without pages says so rather than opening nothing', async () => {
  const empty = project('D:/empty', 'vite')
  const { pages, opened } = source(empty)
  const connection = useScreensConnection(
    pages,
    io({ kind: 'added', project: empty }, { address: 'http://localhost:5173' })
  )

  expect(await connection.connect()).toBe(false)

  expect(opened).toEqual([])
  expect(connection.failure.value).toBe('no-routes')
})

test('a document that already names its project opens its screens by itself', async () => {
  const karbid = project('D:/Karbid2', 'pnpm dev')
  const { pages, bound, opened } = source(karbid, routes('/'))
  const connection = useScreensConnection(pages, ioWithoutChoosing('http://localhost:5173'))

  expect(await connection.ensure()).toBe(true)

  // Nothing was chosen: the project the document names is the one that opens.
  expect(bound).toEqual([])
  expect(opened).toEqual([{ address: 'http://localhost:5173', count: 1 }])
})

test('a second press while the first is running is not a second run', async () => {
  const karbid = project('D:/Karbid2', 'pnpm dev')
  const { pages, bound } = source(karbid, routes('/'))
  let release = (): void => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const connection = useScreensConnection(pages, {
    chooseProject: async () => ({ kind: 'added', project: karbid }),
    startApplication: () => held,
    waitForAddress: async () => 'http://localhost:5173'
  })

  const first = connection.connect()
  const second = connection.connect()
  release()

  expect(await second).toBe(false)
  expect(await first).toBe(true)
  expect(bound).toHaveLength(1)
})

test('an address read from the panel is kept when the project names none', async () => {
  const karbid = project('D:/Karbid2', '   ')
  const { pages, opened } = source(karbid, routes('/pricing'))
  const connection = useScreensConnection(pages, ioWithoutChoosing())

  expect(await connection.ensure('http://localhost:5173')).toBe(true)
  expect(opened).toEqual([{ address: 'http://localhost:5173', count: 1 }])
})
