import { afterEach, expect, test } from 'bun:test'

import { setActiveEditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'
import { SECTION_PADDING } from '@/app/live-pages/grid'
import { useLivePagesSource } from '@/app/live-pages/open'
import type { RouteInfo } from '@/app/live-pages/routes'
import { readLivePage } from '@/app/live-pages/schema'

const stores: ReturnType<typeof createEditorStore>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose()
})

/** A fresh document made the active one, as opening a tab does. */
function openDocument() {
  const store = createEditorStore()
  stores.push(store)
  setActiveEditorStore(store)
  return store
}

const HOME: RouteInfo = { route: '/', file: 'pages/index.vue', params: [] }
const BLOG_POST: RouteInfo = {
  route: '/blog/[slug]',
  file: 'pages/blog/[slug].vue',
  params: ['slug']
}

/** The frames on the current page, the ones inside its sections included, in page order. */
function framesOnPage(store: ReturnType<typeof openDocument>) {
  return store.graph
    .getChildren(store.state.currentPageId)
    .flatMap((node) => (node.type === 'SECTION' ? store.graph.getChildren(node.id) : [node]))
}

/** The page the first frame of the current page shows, as the canvas would read it. */
function pageOfFirstFrame(store: ReturnType<typeof openDocument>) {
  const [frame] = framesOnPage(store)
  return frame ? readLivePage(frame) : null
}

test('a route filled with a long value still makes a page the schema accepts', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  // A label is cut to what `livePageSchema` holds; left whole, the write succeeds and the next read
  // drops the page, so the frame silently goes back to drawing its own layers.
  const slug = 'x'.repeat(300)
  expect(source.openAll([BLOG_POST], 'http://localhost:3000', { slug })).toBe(1)

  const page = pageOfFirstFrame(store)
  expect(page?.url).toBe(`http://localhost:3000/blog/${slug}`)
  expect(page?.label).toHaveLength(120)
})

test('an address typed without its scheme opens its pages', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  expect(source.openAll([HOME], 'localhost:3000')).toBe(1)

  expect(pageOfFirstFrame(store)?.url).toBe('http://localhost:3000')
})

test('an address that is not of a page opens nothing', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  expect(source.openAll([HOME], 'file:///etc/passwd')).toBe(0)

  expect(store.graph.getChildren(store.state.currentPageId)).toHaveLength(0)
})

test('pages open under a section for each area of the application', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  expect(source.openAll([HOME, BLOG_POST], 'http://localhost:3000', { slug: 'hello' })).toBe(2)

  const sections = store.graph.getChildren(store.state.currentPageId)
  expect(sections.map((section) => [section.type, section.name])).toEqual([
    ['SECTION', 'Home'],
    ['SECTION', 'blog']
  ])
})

test('a page sits inside the section of its area, placed from its corner', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  source.openAll([HOME, BLOG_POST], 'http://localhost:3000', { slug: 'hello' })

  // The second section starts under the first one, so a page placed from the page instead of the
  // section would land a whole section too low.
  const sections = store.graph.getChildren(store.state.currentPageId)
  const blog = sections[1]
  const frame = blog ? store.graph.getChildren(blog.id)[0] : undefined
  expect(blog?.name).toBe('blog')
  expect(frame?.parentId).toBe(blog?.id)
  expect(frame?.x).toBe(SECTION_PADDING)
  expect(frame?.y).toBe(SECTION_PADDING)
  expect(frame ? store.graph.getAbsolutePosition(frame.id).y : 0).toBe(
    (blog?.y ?? 0) + SECTION_PADDING
  )
})

test('a screen opens as the live application it is', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  expect(source.openAll([HOME], 'http://localhost:3000')).toBe(1)

  // What keeps a canvas of twenty screens cheap is the layer that draws them: a page runs while it
  // is near the view, and the one a person scrolled away from is its picture.
  expect(pageOfFirstFrame(store)?.mode).toBe('live')
})

test('a second list of screens starts below the first, not on top of it', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  source.openAll([HOME], 'http://localhost:3000')
  source.openAll([BLOG_POST], 'http://localhost:3000', { slug: 'hello' })

  const sections = store.graph.getChildren(store.state.currentPageId)
  const [first, second] = sections
  // Two sections laid at the same corner hide one another, which is what "show all" pressed twice
  // looked like.
  expect(sections).toHaveLength(2)
  expect(second?.y ?? 0).toBeGreaterThanOrEqual((first?.y ?? 0) + (first?.height ?? 0))
})

test('a page already on the canvas is not opened a second time', () => {
  const store = openDocument()
  const source = useLivePagesSource()

  source.openAll([HOME], 'http://localhost:3000')
  expect(source.openAll([HOME], 'http://localhost:3000')).toBe(0)

  expect(framesOnPage(store)).toHaveLength(1)
})
