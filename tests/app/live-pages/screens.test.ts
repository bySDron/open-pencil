import { describe, expect, test } from 'bun:test'

import type { RouteInfo } from '@/app/live-pages/routes'
import {
  filterScreens,
  groupScreens,
  screenName,
  screensOf,
  type Screen
} from '@/app/live-pages/screens'

const HOME: RouteInfo = { route: '/', file: 'pages/index.vue', params: [] }
const PRICING: RouteInfo = { route: '/pricing', file: 'pages/pricing.vue', params: [] }
const BLOG_POST: RouteInfo = {
  route: '/blog/[slug]',
  file: 'pages/blog/[slug].vue',
  params: ['slug']
}

const ADDRESS = 'http://localhost:3000'

describe('the name a screen takes from its path', () => {
  test('the root is Home', () => {
    expect(screenName('/')).toBe('Home')
  })

  test('the last segment reads as words', () => {
    expect(screenName('/pricing')).toBe('Pricing')
    expect(screenName('/account/billing-history')).toBe('Billing history')
  })

  test('a parameter is named by its own name', () => {
    expect(screenName('/blog/[slug]')).toBe('Slug')
  })
})

describe('the screens of the running application', () => {
  test('a route the canvas shows is listed with the name of its frame', () => {
    const screens = screensOf({
      routes: [HOME, PRICING],
      address: ADDRESS,
      open: [{ nodeId: 'frame', url: 'http://localhost:3000/pricing', name: 'Тарифы' }]
    })

    expect(screens.map((screen) => [screen.path, screen.name, screen.nodeId])).toEqual([
      ['/', 'Home', null],
      ['/pricing', 'Тарифы', 'frame']
    ])
  })

  test('a route that needs a value is left out, since no page answers it yet', () => {
    const screens = screensOf({ routes: [HOME, BLOG_POST], address: ADDRESS, open: [] })

    expect(screens.map((screen) => screen.path)).toEqual(['/'])
  })

  test('a frame linked by hand keeps its place after the declared routes', () => {
    const screens = screensOf({
      routes: [HOME],
      address: ADDRESS,
      open: [{ nodeId: 'frame', url: 'http://localhost:3000/secret', name: 'Черновик' }]
    })

    expect(screens.map((screen) => [screen.path, screen.name, screen.nodeId])).toEqual([
      ['/', 'Home', null],
      ['/secret', 'Черновик', 'frame']
    ])
  })

  test('a page that changed since its picture says so', () => {
    const screens = screensOf({
      routes: [HOME],
      address: ADDRESS,
      open: [{ nodeId: 'frame', url: 'http://localhost:3000', name: 'Home' }],
      changed: (nodeId) => nodeId === 'frame'
    })

    expect(screens[0]?.changed).toBe(true)
  })

  test('a frame with a status lists it as the document names it', () => {
    const screens = screensOf({
      routes: [HOME],
      address: ADDRESS,
      open: [{ nodeId: 'frame', url: 'http://localhost:3000', name: 'Home' }],
      statusOf: () => ({ name: 'Ready for dev', color: '#14ae5c' })
    })

    expect(screens[0]?.status).toEqual({ name: 'Ready for dev', color: '#14ae5c' })
  })

  test('a page the canvas does not show yet has no status to read', () => {
    const screens = screensOf({
      routes: [HOME],
      address: ADDRESS,
      open: [],
      statusOf: () => ({ name: 'Ready for dev', color: '#14ae5c' })
    })

    expect(screens[0]?.status).toBeNull()
  })

  test('an address with a trailing slash still matches its frame', () => {
    const screens = screensOf({
      routes: [HOME],
      address: 'http://localhost:3000/',
      open: [{ nodeId: 'frame', url: 'http://localhost:3000', name: 'Home' }]
    })

    expect(screens[0]?.nodeId).toBe('frame')
  })
})

const screens: Screen[] = [
  {
    nodeId: 'a',
    path: '/',
    url: `${ADDRESS}`,
    name: 'Home',
    area: '',
    areaTitle: 'Home',
    status: null,
    changed: false
  },
  {
    nodeId: null,
    path: '/pricing',
    url: `${ADDRESS}/pricing`,
    name: 'Pricing',
    area: '',
    areaTitle: 'Home',
    status: null,
    changed: false
  },
  {
    nodeId: 'b',
    path: '/team',
    url: `${ADDRESS}/team`,
    name: 'Team',
    area: 'team',
    areaTitle: 'team',
    status: null,
    changed: true
  }
]

describe('narrowing the list', () => {
  test('every screen stays without a filter or a search', () => {
    expect(filterScreens(screens, 'all')).toHaveLength(3)
  })

  test('the changed filter keeps the pages that changed', () => {
    expect(filterScreens(screens, 'changed').map((screen) => screen.name)).toEqual(['Team'])
  })

  test('the not-open filter keeps the pages the canvas does not show', () => {
    expect(filterScreens(screens, 'not-open').map((screen) => screen.name)).toEqual(['Pricing'])
  })

  test('a search reads names and paths, and ignores case', () => {
    expect(filterScreens(screens, 'all', 'pri').map((screen) => screen.name)).toEqual(['Pricing'])
    expect(filterScreens(screens, 'all', '/TEAM').map((screen) => screen.name)).toEqual(['Team'])
  })

  test('a search that matches nothing leaves an empty list', () => {
    expect(filterScreens(screens, 'all', 'checkout')).toEqual([])
  })
})

test('screens group under the section of their area, the root first', () => {
  const groups = groupScreens(screens)

  expect(groups.map((group) => group.title)).toEqual(['Home', 'team'])
  expect(groups[0]?.items.map((screen) => screen.name)).toEqual(['Home', 'Pricing'])
})
