import { expect, test } from 'bun:test'

import { screensInView, type ScreenBox } from '@/app/live-pages/visibility'

/**
 * What a canvas of live screens costs.
 *
 * Each screen is the real application, so which ones run is a decision about the machine the canvas
 * runs on: the screens around the view run, and the ones in the view are drawn as themselves.
 */

const VIEWPORT = { width: 1000, height: 800 }
const STILL = { panX: 0, panY: 0, zoom: 1 }

function screen(nodeId: string, x: number, y = 0): ScreenBox {
  return { nodeId, at: { x, y }, width: 1440, height: 900 }
}

test('a screen in the view runs and is drawn as itself', () => {
  const view = screensInView([screen('home', 0)], STILL, VIEWPORT)

  expect([...view.running]).toEqual(['home'])
  expect([...view.shown]).toEqual(['home'])
})

test('a screen a scroll away keeps running, but is its picture', () => {
  const view = screensInView([screen('home', 0), screen('next', 1600)], STILL, VIEWPORT)

  // Keeping it running is what makes coming back to it instant rather than a reload.
  expect([...view.running]).toEqual(['home', 'next'])
  expect([...view.shown]).toEqual(['home'])
})

test('a screen further than a canvas away is not run at all', () => {
  const view = screensInView([screen('home', 0), screen('far', 9000)], STILL, VIEWPORT)

  expect([...view.running]).toEqual(['home'])
  expect([...view.shown]).toEqual(['home'])
})

test('panning moves the view, and which screens run with it', () => {
  const screens = [screen('home', 0), screen('far', 3000)]

  const moved = screensInView(screens, { panX: -3000, panY: 0, zoom: 1 }, VIEWPORT)

  expect([...moved.running]).toEqual(['far'])
  expect([...moved.shown]).toEqual(['far'])
})

test('a canvas that has not been drawn yet runs no screen', () => {
  const empty = screensInView([screen('home', 0)], STILL, { width: 0, height: 0 })
  const unzoomed = screensInView([screen('home', 0)], { panX: 0, panY: 0, zoom: 0 }, VIEWPORT)

  expect(empty.running.size).toBe(0)
  expect(unzoomed.shown.size).toBe(0)
})
