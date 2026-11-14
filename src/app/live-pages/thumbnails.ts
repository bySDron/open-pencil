import { computed, ref } from 'vue'

import { imageDataURL } from '@open-pencil/scene-graph/images'

import { desktopPageCapture, isLoopbackAddress } from './drift/capture'
import type { PageCapture } from './drift/run'

/**
 * Small pictures of the screens, so the list can be read by eye.
 *
 * A page is drawn by the machine's own browser - the webview cannot hand out a picture of a page it
 * does not own - which costs a second or two per screen. A picture is therefore taken once, kept
 * for a while, and asked for only for a page on this machine: a list of twelve screens must not
 * start twelve browsers at once.
 */

/** The size a thumbnail is taken at, which is bigger than it is shown so it stays sharp. */
export const THUMBNAIL_WIDTH = 480
export const THUMBNAIL_HEIGHT = 300

/** How long a picture is kept before the page is looked at again. */
export const THUMBNAIL_TTL_MS = 10 * 60 * 1000

/** How many screens are drawn at once, which is one browser at a time. */
const THUMBNAIL_CONCURRENCY = 1

export type ScreenThumbnail = {
  /** The picture as a data URL, which a list can show without a file. */
  src: string
  /** When it was taken, so a stale picture is taken again. */
  takenAt: number
}

/** Whether a kept picture is still the page as it is now. */
export function isFresh(thumbnail: ScreenThumbnail, now = Date.now()): boolean {
  return now - thumbnail.takenAt < THUMBNAIL_TTL_MS
}

/**
 * The pictures of the screens, by the address of the page they show. Asking twice for one page is
 * one picture, and a page off this machine is never asked for at all.
 */
/** The cache one caller keeps, which a test builds with a capture of its own. */
export function createScreenThumbnails(capture: PageCapture) {
  const pictures = ref<Record<string, ScreenThumbnail>>({})
  const waiting = ref<Record<string, true>>({})
  const queue: string[] = []
  let running = 0

  function thumbnailOf(url: string): ScreenThumbnail | null {
    if (!Object.hasOwn(pictures.value, url)) return null
    const kept = pictures.value[url]
    return isFresh(kept) ? kept : null
  }

  function pendingOf(url: string): boolean {
    return Boolean(waiting.value[url])
  }

  async function draw(url: string): Promise<void> {
    running += 1
    waiting.value = { ...waiting.value, [url]: true }
    try {
      const shot = await capture({
        nodeId: url,
        url,
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT
      })
      if (shot === null) return
      pictures.value = {
        ...pictures.value,
        [url]: { src: imageDataURL(shot.bytes), takenAt: Date.now() }
      }
    } catch (error) {
      // A page that will not be drawn is a row without a picture, not a broken list.
      console.warn('[Screens] The screen could not be drawn:', url, error)
    } finally {
      const stillWaiting: Record<string, true> = {}
      for (const [key, value] of Object.entries(waiting.value)) {
        if (key !== url) stillWaiting[key] = value
      }
      waiting.value = stillWaiting
      running -= 1
      startNext()
    }
  }

  /** Start the next picture that is waiting, while the budget allows one more browser. */
  function startNext(): void {
    while (running < THUMBNAIL_CONCURRENCY && queue.length > 0) {
      const url = queue.shift()
      if (url === undefined) return
      void draw(url)
    }
  }

  /** Take a picture of a page, unless one is kept, one is on its way, or it is not on this machine. */
  function request(url: string): void {
    if (!isLoopbackAddress(url)) return
    if (thumbnailOf(url) !== null || pendingOf(url)) return
    if (queue.includes(url)) return
    queue.push(url)
    startNext()
  }

  /** Forget a picture, which a reloaded page asks for: the screen changed under it. */
  function forget(url: string): void {
    if (!(url in pictures.value)) return
    const kept: Record<string, ScreenThumbnail> = {}
    for (const [key, value] of Object.entries(pictures.value)) {
      if (key !== url) kept[key] = value
    }
    pictures.value = kept
  }

  return { pictures: computed(() => pictures.value), thumbnailOf, pendingOf, request, forget }
}

/**
 * The pictures the whole application shares. A screen's picture is taken once however many parts of
 * the window ask for it, and a frame that reloads can drop the one it had.
 */
const shared = createScreenThumbnails(desktopPageCapture())

export function useScreenThumbnails() {
  return shared
}

/** The shared cache, for the parts of the window that only forget a picture. */
export const screenThumbnails = shared
