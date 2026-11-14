import { areaOf, areaTitle, groupByArea } from './areas'
import { routeURL, type RouteInfo } from './routes'

/** A status as the document's own workflow names it, with the colour that workflow gives it. */
export type ScreenStatus = {
  name: string
  /** `#RRGGBB`. */
  color: string
}

/** A page of the running application as the panel lists it, shown on the canvas or not. */
export type Screen = {
  /** The frame that shows the page, or null while the canvas does not hold it yet. */
  nodeId: string | null
  /** The path the page serves. */
  path: string
  /** The address the page answers on. */
  url: string
  /** What the screen is called: the frame's own name, or the path read as a name. */
  name: string
  /** The part of the address the screen belongs to, and the title its section shows. */
  area: string
  areaTitle: string
  /** The status the frame shows, or null while it has none. */
  status: ScreenStatus | null
  /** Whether the page changed since the picture kept for it; false when nothing was compared. */
  changed: boolean
}

/** What the list is narrowed to: every screen, the changed ones, or the ones still to open. */
export type ScreenFilter = 'all' | 'changed' | 'not-open'

const TRAILING_SLASH = /\/+$/
const PARAM_SEGMENT = /^\[{1,2}\.{0,3}(.+?)\]{1,2}$/

/** Two addresses name the same page when they differ only by a trailing slash. */
function normalizedURL(url: string): string {
  return url.trim().replace(TRAILING_SLASH, '')
}

/** The path an address serves, or the address itself when it cannot be read as one. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') || '/'
  }
}

/**
 * The name a screen takes from the path it serves: its last segment read as words, with a
 * parameter named by its own name and the root called Home. A frame that already has a name keeps
 * that name instead, so renaming a screen is renaming its layer.
 */
export function screenName(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  const last = segments.at(-1)
  if (last === undefined) return 'Home'
  const words = (PARAM_SEGMENT.exec(last)?.[1] ?? last).replaceAll(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The pages the panel lists: the routes the application serves, plus the frames linked by hand. */
export type ScreenSource = {
  /** The routes the project declares, as the application serves them. */
  routes: readonly RouteInfo[]
  /** The address the application answers on. */
  address: string
  /** The pages the canvas already shows, by frame. */
  open: readonly { nodeId: string; url: string; name: string }[]
  /** Whether a page changed since the picture kept for it. */
  changed?: (nodeId: string) => boolean
  /** The status a frame shows, as the document's workflow names it. */
  statusOf?: (nodeId: string) => ScreenStatus | null
}

/** A frame the canvas shows, as the list matches it to the page it answers. */
export type OpenScreen = { nodeId: string; url: string; name: string }

/** The row one route makes, with the frame that shows it when the canvas holds one. */
function screenOfRoute(route: RouteInfo, frame: OpenScreen | undefined, source: ScreenSource) {
  const area = areaOf(route.route)
  return {
    nodeId: frame?.nodeId ?? null,
    path: route.route,
    url: routeURL(source.address, route.route),
    name: frame?.name ?? screenName(route.route),
    area,
    areaTitle: areaTitle(area),
    status: frame ? (source.statusOf?.(frame.nodeId) ?? null) : null,
    changed: frame ? (source.changed?.(frame.nodeId) ?? false) : false
  } satisfies Screen
}

/** The row a frame linked by hand makes, for a page the project does not declare. */
function screenOfFrame(frame: OpenScreen, source: ScreenSource) {
  const path = pathOf(frame.url)
  const area = areaOf(path)
  return {
    nodeId: frame.nodeId,
    path,
    url: frame.url,
    name: frame.name,
    area,
    areaTitle: areaTitle(area),
    status: source.statusOf?.(frame.nodeId) ?? null,
    changed: source.changed?.(frame.nodeId) ?? false
  } satisfies Screen
}

/**
 * Every page of the application, in the order the routes come in, with the frame that shows it
 * when the canvas holds one. A route that needs a value serves no page until one is given, so it
 * is left out, as the application cannot open it by name either — the same rule `openAll` follows.
 * A frame linked to a page the project does not declare keeps its place at the end, so a page
 * opened by hand is never lost from the list.
 */
export function screensOf(source: ScreenSource): Screen[] {
  const shown = new Map<string, OpenScreen>()
  for (const entry of source.open) shown.set(normalizedURL(entry.url), entry)

  const screens: Screen[] = []
  const listed = new Set<string>()
  for (const route of source.routes) {
    if (route.params.length > 0) continue
    const url = routeURL(source.address, route.route)
    if (url === '') continue
    const key = normalizedURL(url)
    listed.add(key)
    screens.push(screenOfRoute(route, shown.get(key), source))
  }

  for (const frame of source.open) {
    if (listed.has(normalizedURL(frame.url))) continue
    screens.push(screenOfFrame(frame, source))
  }
  return screens
}

/** The screens left by a filter and a search over their names and paths. */
export function filterScreens(
  screens: readonly Screen[],
  filter: ScreenFilter,
  query = ''
): Screen[] {
  const text = query.trim().toLowerCase()
  return screens.filter((screen) => {
    if (filter === 'changed' && !screen.changed) return false
    if (filter === 'not-open' && screen.nodeId !== null) return false
    if (text === '') return true
    return screen.name.toLowerCase().includes(text) || screen.path.toLowerCase().includes(text)
  })
}

/** The screens under the section of their area, as the panel lists them and the canvas holds them. */
export function groupScreens(screens: readonly Screen[]) {
  return groupByArea(screens, (screen) => screen.area)
}
