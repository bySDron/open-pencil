/** The path a route serves, as sections read it: the first segment of the address. */
export function areaOf(path: string): string {
  const first = path.split('/').find((segment) => segment !== '')
  return first === undefined || first.startsWith('[') ? '' : first
}

/** The name a section goes by: the area itself, and Home for the pages at the root. */
export function areaTitle(area: string): string {
  return area === '' ? 'Home' : area
}

/** Routes of one area, under the section that holds them. */
export type AreaGroup<T> = {
  /** The segment the area is named by, empty for the root. */
  area: string
  /** The name the section shows. */
  title: string
  items: T[]
}

/**
 * Routes grouped into the section each belongs to: the root's pages come first, since that is the
 * page the application opened on, and the rest read alphabetically, as a list of areas does. The
 * order inside a group is the order the routes arrived in, so a person's choice of order survives.
 */
export function groupByArea<T>(
  items: readonly T[],
  areaOfItem: (item: T) => string
): AreaGroup<T>[] {
  const groups = new Map<string, AreaGroup<T>>()
  for (const item of items) {
    const area = areaOfItem(item)
    const group = groups.get(area) ?? { area, title: areaTitle(area), items: [] }
    group.items.push(item)
    groups.set(area, group)
  }
  return [...groups.values()].sort((left, right) => byArea(left.area, right.area))
}

function byArea(left: string, right: string): number {
  if (left === right) return 0
  // Home reads first whatever its name, since the root is where the application starts.
  if (left === '') return -1
  if (right === '') return 1
  return left.localeCompare(right)
}
