import { expect, test } from 'bun:test'

import type { UIMessage } from 'ai'

import type { PreparedImageAttachment } from '@/app/ai/attachment/image/types'
import { dataURL, imageFilePart } from '@/app/ai/chat/submission/files'
import { imagePromptBlocks } from '@/app/ai/transports/acp'

function picture(bytes: number[]): PreparedImageAttachment {
  return {
    data: new Uint8Array(bytes),
    blob: new Blob(),
    mediaType: 'image/png',
    originalWidth: 2,
    originalHeight: 2,
    width: 2,
    height: 2
  }
}

test('a picture attached to a message reaches the agent as its own prompt block', () => {
  const parts = [
    { type: 'text', text: 'look at this' },
    {
      type: 'file',
      mediaType: 'image/png',
      filename: 'shot.png',
      url: 'data:image/png;base64,QUJD'
    },
    { type: 'file', mediaType: 'text/csv', filename: 'data.csv', url: 'data:text/csv;base64,QQ==' }
  ] as UIMessage['parts']

  expect(imagePromptBlocks(parts)).toEqual([{ type: 'image', data: 'QUJD', mimeType: 'image/png' }])
})

test('a message with no pictures asks the agent for nothing extra', () => {
  const parts = [{ type: 'text', text: 'hello' }] as UIMessage['parts']

  expect(imagePromptBlocks(parts)).toEqual([])
})

test('a picture travels as the data URL a message holds', () => {
  const part = imageFilePart(picture([65, 66, 67]), 'shot.png')

  expect(part).toEqual({
    type: 'file',
    mediaType: 'image/png',
    filename: 'shot.png',
    url: 'data:image/png;base64,QUJD'
  })
})

test('a picture without a name is named after its type', () => {
  expect(imageFilePart(picture([65]), '').filename).toBe('image.png')
  expect(dataURL(picture([65]))).toBe('data:image/png;base64,QQ==')
})
