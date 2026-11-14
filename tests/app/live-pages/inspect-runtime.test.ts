import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type { Rect } from '@open-pencil/scene-graph/primitives'
import { asDouble } from '@open-pencil/test-support/doubles'
import { repoPath } from '@open-pencil/test-support/paths'

import { readInspectMessage } from '@/app/live-pages/inspect-protocol'

/**
 * The inspector is a script a page runs, so it is tested as one: the file is loaded into a fake
 * page and asked for its elements, and every answer it posts is read back by the parser the app
 * uses. A change to either side that the other does not understand fails here, not in a frame.
 */

const SOURCE = readFileSync(repoPath('desktop/src/inspect/runtime.js'), 'utf8')

/** One element of the fake page. */
function element(
  tag: string,
  options: { classes?: string[]; text?: string; rect?: Rect; children?: unknown[] } = {}
) {
  return {
    tagName: tag.toUpperCase(),
    classList: options.classes ?? [],
    childNodes: options.text === undefined ? [] : [{ nodeType: 3, nodeValue: options.text }],
    children: options.children ?? [],
    style: {
      setProperty: () => undefined,
      removeProperty: () => undefined
    },
    isConnected: true,
    appendChild: () => undefined,
    setAttribute: () => undefined,
    getBoundingClientRect: () =>
      asDouble<DOMRect>(options.rect ?? { x: 0, y: 0, width: 10, height: 10 })
  }
}

/** A page with a box that holds a button, which is where a person clicks. */
function page() {
  const revealed: string[] = []
  const button = element('button', {
    classes: ['rp-button', 'wide'],
    text: 'Save',
    rect: { x: 4, y: 8, width: 120, height: 40 }
  })
  // A page that is longer than its viewport brings a picked element into view when asked.
  Object.assign(button, {
    scrollIntoView: () => revealed.push(button.tagName)
  })
  const box = element('div', { classes: ['card'], children: [button] })
  const body = element('body', { children: [box] })

  const posted: unknown[] = []
  const listeners: ((event: MessageEvent) => void)[] = []

  const document = {
    readyState: 'complete',
    body,
    documentElement: body,
    createElement: () => element('div'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    elementFromPoint: () => button,
    defaultView: null
  }
  const window = {
    top: {},
    parent: { postMessage: (message: unknown) => posted.push(message) },
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      if (type === 'message') listeners.push(listener)
    },
    removeEventListener: () => undefined,
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible',
      getPropertyValue: () => '16px'
    })
  }

  const run = new Function('window', 'document', SOURCE)
  run(window, document)

  const ask = (request: Record<string, unknown>) => {
    for (const listener of listeners) {
      listener(asDouble<MessageEvent>({ data: { source: 'open-pencil-host', ...request } }))
    }
  }
  return { posted, ask, revealed }
}

test('the inspector answers with the elements of the page, as the app reads them', () => {
  const subject = page()

  // A page that has just loaded says it is there, so the app knows its inspector runs.
  expect(readInspectMessage(subject.posted[0])?.type).toBe('ready')

  subject.ask({ type: 'tree' })

  const message = readInspectMessage(subject.posted.at(-1))
  expect(message?.type).toBe('tree')
  if (message?.type !== 'tree') throw new Error('the page answered no tree')
  // The page itself, the box, and the button: everything a layer list shows.
  expect(message.nodes.map((node) => node.tag)).toEqual(['body', 'div', 'button'])
  expect(message.nodes[2].classes).toEqual(['rp-button', 'wide'])
  expect(message.nodes[2].text).toBe('Save')
  expect(message.nodes[2].rect).toEqual({ x: 4, y: 8, width: 120, height: 40 })
})

test('selecting an element of the page answers with its node and its values', () => {
  const subject = page()
  subject.ask({ type: 'tree' })

  subject.ask({ type: 'select', id: '2' })

  const picked = readInspectMessage(subject.posted.at(-1))
  expect(picked?.type).toBe('picked')
  if (picked?.type !== 'picked') throw new Error('the page answered no pick')
  expect(picked.pick.node.tag).toBe('button')
  expect(picked.pick.styles.padding).toBe('16px')
  // An element picked from a list is brought into view, since a person may be looking elsewhere.
  expect(subject.revealed).toEqual(['BUTTON'])
})

test('a value written from the panel is answered with the values the page has now', () => {
  const subject = page()
  subject.ask({ type: 'tree' })
  subject.ask({ type: 'select', id: '2' })

  subject.ask({ type: 'style', key: 'padding', value: '4px' })

  const answered = readInspectMessage(subject.posted.at(-1))
  expect(answered?.type).toBe('styles')
  if (answered?.type !== 'styles') throw new Error('the page answered no values')
  expect(answered.styles.padding).toBe('16px')
})

test('the page says it is ready, and says nothing to a request it does not know', () => {
  const subject = page()
  const before = subject.posted.length

  subject.ask({ type: 'nonsense' })

  expect(subject.posted).toHaveLength(before)
  expect(readInspectMessage({ source: 'open-pencil-inspect', type: 'ready', payload: {} })).toEqual(
    { type: 'ready' }
  )
})
