import * as v from 'valibot'

import type { Rect } from '@open-pencil/scene-graph/primitives'

import type { LiveStyleKey } from './inspect'

/**
 * What the runtime injected into every live page says, and what it is asked.
 *
 * A live page is another origin, so the app cannot read its document: everything the inspector
 * knows comes from a script the window injects into the page itself, which answers over
 * `postMessage`. The shapes below are that conversation, kept in one place so the page, the canvas,
 * and the properties panel cannot drift apart.
 */

/** The marker that tells the page's own chatter from the inspector's words. */
export const INSPECT_SOURCE = 'open-pencil-inspect'

/** One element of a page, as the runtime describes it. */
export type PageNode = {
  /** Stable within one tree answer: the walk's own index. */
  id: string
  parentId: string | null
  depth: number
  tag: string
  classes: string[]
  text: string
  /** The element's box in the page's own pixels. */
  rect: Rect
  /** The Vue component that rendered it, from the development build's own `__file`. */
  component: { name: string; file: string } | null
}

/** What a picked element is, and the values the page computes for it. */
export type PagePick = {
  node: PageNode
  styles: Record<string, string>
}

export type InspectMessage =
  | { type: 'ready' }
  | { type: 'tree'; nodes: PageNode[] }
  | { type: 'hover'; rect: PageNode['rect'] | null }
  | { type: 'picked'; pick: PagePick }
  | { type: 'styles'; styles: Record<string, string>; rect: PageNode['rect'] }

/** What the app asks a page: one request per message, answered by type. */
export type InspectRequest =
  | { type: 'ping' }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'tree' }
  | { type: 'select'; id: string }
  /** Find an element again by its own name, which a page that reloaded has to do. */
  | { type: 'pickSelector'; selector: string }
  | { type: 'style'; key: LiveStyleKey; value: string }
  | { type: 'reset' }
  | { type: 'clear' }

const rectSchema = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number()
})

const pageNodeSchema = v.object({
  id: v.string(),
  parentId: v.nullable(v.string()),
  depth: v.number(),
  tag: v.string(),
  classes: v.array(v.string()),
  text: v.string(),
  rect: rectSchema,
  component: v.nullable(v.object({ name: v.string(), file: v.string() }))
})

const envelopeSchema = v.object({
  source: v.literal(INSPECT_SOURCE),
  type: v.string(),
  payload: v.unknown()
})

const stylesSchema = v.record(v.string(), v.string())

/** The message a page sent, or null for anything else on the window, which is not ours. */
export function readInspectMessage(data: unknown): InspectMessage | null {
  const envelope = v.safeParse(envelopeSchema, data)
  if (!envelope.success) return null
  const { type, payload } = envelope.output
  if (type === 'ready') return { type: 'ready' }
  if (type === 'tree') {
    const parsed = v.safeParse(v.object({ nodes: v.array(pageNodeSchema) }), payload)
    return parsed.success ? { type: 'tree', nodes: parsed.output.nodes } : null
  }
  if (type === 'hover') {
    const parsed = v.safeParse(v.object({ rect: v.nullable(rectSchema) }), payload)
    return parsed.success ? { type: 'hover', rect: parsed.output.rect } : null
  }
  if (type === 'picked') {
    const parsed = v.safeParse(
      v.object({ pick: v.object({ node: pageNodeSchema, styles: stylesSchema }) }),
      payload
    )
    return parsed.success ? { type: 'picked', pick: parsed.output.pick } : null
  }
  if (type === 'styles') {
    const parsed = v.safeParse(v.object({ styles: stylesSchema, rect: rectSchema }), payload)
    return parsed.success ? { type: 'styles', ...parsed.output } : null
  }
  return null
}

/** The message that asks a page for something, in the envelope the runtime listens for. */
export function inspectRequest(request: InspectRequest): string {
  return JSON.stringify({ source: 'open-pencil-host', ...request })
}
