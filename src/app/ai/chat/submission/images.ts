import { analyzeAttachedImages } from '@/app/ai/attachment/image/analyze'
import { prepareImageAttachment } from '@/app/ai/attachment/image/prepare'
import type { PreparedImageAttachment, ImageAttachmentDraft } from '@/app/ai/attachment/image/types'
import { designModelTakesImages } from '@/app/ai/models'
import type { EditorStore } from '@/app/editor/active-store'

/** What a message's images became: the pictures themselves, and what a vision model saw in them. */
export type SubmittedImages = {
  prepared: PreparedImageAttachment[]
  /**
   * The vision model's findings, or null when the agent itself takes the pictures: a model that
   * reads images needs no description of them, and describing them would cost a second request.
   */
  findings: string | null
}

/**
 * Prepares a message's images for the model. A design model that reads images receives them as
 * they are; only a model that does not is given the findings of a vision model instead.
 */
export async function prepareSubmittedImages(
  editor: EditorStore,
  text: string,
  images: ImageAttachmentDraft[]
): Promise<SubmittedImages> {
  const prepared = await Promise.all(images.map((image) => prepareImageAttachment(image.file)))
  if (designModelTakesImages()) return { prepared, findings: null }
  const findings = await analyzeAttachedImages(editor, text, prepared)
  return { prepared, findings }
}
