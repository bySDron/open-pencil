import { describe, expect, test } from 'bun:test'

import { areaOf, areaTitle, groupByArea } from '@/app/live-pages/areas'

describe('the area a route belongs to', () => {
  test('the first segment names it', () => {
    expect(areaOf('/blog/[slug]')).toBe('blog')
    expect(areaOf('/settings/billing')).toBe('settings')
  })

  test('the root page belongs to no area', () => {
    expect(areaOf('/')).toBe('')
  })

  test('a route that starts with a parameter belongs to no area of its own', () => {
    expect(areaOf('/[slug]/edit')).toBe('')
  })

  test('Home names the section the root sits in, an area names its own', () => {
    expect(areaTitle('')).toBe('Home')
    expect(areaTitle('blog')).toBe('blog')
  })
})

describe('grouping routes into sections', () => {
  const routes = ['/settings', '/blog/first', '/', '/blog/second', '/about']

  test('the root comes first, then the areas read alphabetically', () => {
    const groups = groupByArea(routes, areaOf)
    expect(groups.map((group) => group.title)).toEqual(['Home', 'about', 'blog', 'settings'])
  })

  test('a group keeps the order its routes arrived in', () => {
    const blog = groupByArea(routes, areaOf).find((group) => group.area === 'blog')
    expect(blog?.items).toEqual(['/blog/first', '/blog/second'])
  })
})
