import { expect, test } from 'bun:test'

import { SOURCE_LINE_LIMIT, componentSource } from '@/app/live-pages/component-source'

/** A file whose bytes are the text a test gives it. */
function reader(text: string, calls: string[] = []) {
  return async (path: string): Promise<Uint8Array> => {
    calls.push(path)
    return new TextEncoder().encode(text)
  }
}

test('the file a component lives in is read as the text a panel shows', async () => {
  const calls: string[] = []

  const source = await componentSource(
    '/app/components/SaveButton.vue',
    reader('<template>\n  <button>Save</button>\n</template>\n', calls)
  )

  expect(calls).toEqual(['/app/components/SaveButton.vue'])
  expect(source?.path).toBe('/app/components/SaveButton.vue')
  expect(source?.text).toContain('<button>Save</button>')
  expect(source?.lines).toBe(4)
  expect(source?.truncated).toBe(false)
})

test('a long file is cut to what a panel can hold, and says so', async () => {
  const lines = Array.from({ length: SOURCE_LINE_LIMIT + 20 }, (_, index) => `line ${index}`)

  const source = await componentSource('/app/Long.vue', reader(lines.join('\n')))

  expect(source?.text.split('\n')).toHaveLength(SOURCE_LINE_LIMIT)
  expect(source?.lines).toBe(SOURCE_LINE_LIMIT + 20)
  expect(source?.truncated).toBe(true)
})

test('an element with no file to name reads nothing', async () => {
  expect(await componentSource(null)).toBeNull()
  expect(await componentSource('   ')).toBeNull()
})

test('a file this app cannot read leaves the panel without a source', async () => {
  const source = await componentSource('/app/Gone.vue', async () => {
    throw new Error('os error 2')
  })

  expect(source).toBeNull()
})
