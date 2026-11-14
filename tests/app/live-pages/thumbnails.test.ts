import { expect, test } from 'bun:test'

import { toUint8Array } from 'js-base64'

import { imageDataURL } from '@open-pencil/scene-graph/images'
import { asDouble } from '@open-pencil/test-support/doubles'

import type { PageCapture } from '@/app/live-pages/drift/run'
import { THUMBNAIL_TTL_MS, createScreenThumbnails, isFresh } from '@/app/live-pages/thumbnails'

/** A one-pixel PNG, which is enough for a test that only asks whether a picture arrived. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A capture that draws one pixel per page and counts the pages it was asked for. */
function capture() {
  const asked: string[] = []
  const page: PageCapture = asDouble<PageCapture>(async (target: { url: string }) => {
    asked.push(target.url)
    return { bytes: toUint8Array(PIXEL), width: 480, height: 300 }
  })
  return { asked, page }
}

/** Lets the queue of pictures settle, since each one is drawn asynchronously. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

test('a picture kept for a page is a picture the list shows', async () => {
  const { page } = capture()
  const thumbs = createScreenThumbnails(page)

  thumbs.request('http://localhost:3000/pricing')
  await settle()

  expect(thumbs.thumbnailOf('http://localhost:3000/pricing')?.src).toBe(
    imageDataURL(toUint8Array(PIXEL))
  )
})

test('a page is drawn once, however many rows ask for it', async () => {
  const { asked, page } = capture()
  const thumbs = createScreenThumbnails(page)

  thumbs.request('http://localhost:3000/pricing')
  thumbs.request('http://localhost:3000/pricing')
  await settle()
  thumbs.request('http://localhost:3000/pricing')
  await settle()

  expect(asked).toEqual(['http://localhost:3000/pricing'])
})

test('a page off this machine is never drawn', async () => {
  const { asked, page } = capture()
  const thumbs = createScreenThumbnails(page)

  thumbs.request('https://example.com/pricing')
  await settle()

  expect(asked).toEqual([])
  expect(thumbs.thumbnailOf('https://example.com/pricing')).toBeNull()
})

test('a kept picture is fresh for ten minutes and stale after that', () => {
  const taken = { src: 'a picture', takenAt: 1_000 }

  expect(isFresh(taken, 1_000 + THUMBNAIL_TTL_MS - 1)).toBe(true)
  expect(isFresh(taken, 1_000 + THUMBNAIL_TTL_MS)).toBe(false)
})

test('a stale picture is drawn again when its page is asked for', async () => {
  const { asked, page } = capture()
  const thumbs = createScreenThumbnails(page)
  thumbs.request('http://localhost:3000/pricing')
  await settle()

  // A page that has changed under its picture is taken again, which a reload does.
  thumbs.forget('http://localhost:3000/pricing')
  thumbs.request('http://localhost:3000/pricing')
  await settle()

  expect(asked).toHaveLength(2)
})

test('a page that will not be drawn leaves the list a row without a picture', async () => {
  const failed: PageCapture = asDouble<PageCapture>(async () => null)
  const thumbs = createScreenThumbnails(failed)

  thumbs.request('http://localhost:3000/pricing')
  await settle()

  expect(thumbs.thumbnailOf('http://localhost:3000/pricing')).toBeNull()
  expect(thumbs.pendingOf('http://localhost:3000/pricing')).toBe(false)
})
