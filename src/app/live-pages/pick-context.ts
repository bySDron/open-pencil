import { selectorOf } from './inspect'
import { pickedElement, writtenStyles } from './pick'

/**
 * The element a person is looking at on a running page, in the words a chat request carries.
 *
 * A question about "this button" is unanswerable unless the request says which button: the element
 * is named by its selector, by the component file the page reports, and by the values the panel
 * changed on it, so an agent needs neither a picture nor a search to find it.
 */
export type PickedScreenElement = {
  /** The element's own name, as a stylesheet or a dev tools search writes it. */
  selector: string
  /** The Vue component that rendered it, from the development build's own `__file`. */
  componentFile: string | null
  /** The values the panel changed on the element, in CSS, or empty when it changed none. */
  changed: string
}

/** The values this app wrote onto the picked element, in the order they were written. */
export function changedValues(): string {
  return Object.entries(writtenStyles.value)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

/** The element a person is looking at, or null while nothing is picked. */
export function pickedScreenElement(): PickedScreenElement | null {
  const current = pickedElement.value
  if (current === null) return null
  return {
    selector: selectorOf(current.node),
    componentFile: current.node.component?.file ?? null,
    changed: changedValues()
  }
}
