import { expect, test } from 'bun:test'

import { loopbackTwins, reachableAddress, relocatedPage } from '@/app/live-pages/address'

test('the two spellings of this machine are tried one after the other', () => {
  expect(loopbackTwins('http://localhost:3000/')).toEqual([
    'http://localhost:3000/',
    'http://127.0.0.1:3000/'
  ])
  expect(loopbackTwins('http://127.0.0.1:3000/pricing')).toEqual([
    'http://127.0.0.1:3000/pricing',
    'http://localhost:3000/pricing'
  ])
  // An address that names another host has no twin this machine can answer at.
  expect(loopbackTwins('https://app.example.com/')).toEqual(['https://app.example.com/'])
})

test('a line that is not an address has nothing to try', () => {
  expect(loopbackTwins('not a url')).toEqual(['not a url'])
})

test('a page keeps its path when the application moves to another spelling', () => {
  expect(relocatedPage('http://127.0.0.1:3000/pricing?tab=2', 'http://localhost:3000')).toBe(
    'http://localhost:3000/pricing?tab=2'
  )
  // A page already on that origin stays where it is.
  expect(relocatedPage('http://localhost:3000/pricing', 'http://localhost:3000')).toBeNull()
  expect(relocatedPage('not a url', 'http://localhost:3000')).toBeNull()
})

test('the spelling that answers is the one a page is opened at', async () => {
  const asked: string[] = []
  const answering = async (url: string): Promise<boolean> => {
    asked.push(url)
    return url.includes('localhost')
  }

  expect(await reachableAddress('http://127.0.0.1:3000/', answering)).toBe('http://localhost:3000/')
  // The address as given is asked first, so a server that answers where it says costs one probe.
  expect(asked).toEqual(['http://127.0.0.1:3000/', 'http://localhost:3000/'])
})

test('an address nothing answers at comes back empty rather than guessed', async () => {
  const refused = async (): Promise<boolean> => false

  expect(await reachableAddress('http://localhost:3000/', refused)).toBe('')
})
