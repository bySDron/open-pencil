import {
  appendScreenElementContext,
  appendSkillContext,
  type InvokedSkill
} from '@/app/ai/chat/context'
import { pickedScreenElement } from '@/app/live-pages/pick/context'

/**
 * The request as the model receives it: what the person wrote, the instructions of a skill they
 * ran, and the element they are looking at on a running page. None of it is shown back in the chat,
 * which shows the words that were typed.
 */
export function modelRequestText(text: string, skill: InvokedSkill | null): string {
  return appendScreenElementContext(appendSkillContext(text, skill), pickedScreenElement())
}
