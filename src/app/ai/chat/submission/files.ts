import type { FileUIPart } from 'ai'

import { imageDataURL } from '@open-pencil/scene-graph/images'

import type {
  ImageAttachmentDraft,
  PreparedImageAttachment
} from '@/app/ai/attachment/image/types'

/**
 * The pictures of a message as the parts a model that reads images receives. The bytes travel as
 * a data URL, which is what a chat message can hold and what the agent's transport turns back into
 * an image prompt.
 */
export function imageFiles(
  prepared: PreparedImageAttachment[],
  images: ImageAttachmentDraft[]
): FileUIPart[] {
  return prepared.map((image, index) => imageFilePart(image, images[index]?.file.name ?? ''))
}

/** One picture as a message part, named as the person's file was named. */
export function imageFilePart(image: PreparedImageAttachment, filename: string): FileUIPart {
  return {
    type: 'file',
    mediaType: image.mediaType,
    filename: filename === '' ? `image.${extensionOf(image.mediaType)}` : filename,
    url: dataURL(image)
  }
}

/** The bytes of a picture as a data URL, which is how a picture rides in a message. */
export function dataURL(image: PreparedImageAttachment): string {
  return imageDataURL(image.data)
}

/** The file extension a media type is written with. */
function extensionOf(mediaType: string): string {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.replace('image/', '')
}
