import { computed } from 'vue'

import { useEditorStore } from '@/app/editor/active-store'
import { readRepositoryRoot, runGit } from '@/app/integrations/git/client'
import { createProject, normalizePath, type Project } from '@/app/projects/schema'
import { useProjects } from '@/app/projects/store'

import { areaOf, groupByArea } from './areas'
import { readDocumentProject, writeDocumentProject, type DocumentProject } from './bind'
import { layoutGroups } from './grid'
import { fillRoute, pagePaths, routeURL, routesFromFiles, type RouteInfo } from './routes'
import { normalizeLiveURL, pageLabel, pluginDataWithLivePage } from './schema'

/** The frame one page opens in; a page is a desktop screen until it is resized. */
export const PAGE_WIDTH = 1440
export const PAGE_HEIGHT = 900

/**
 * Where the pages of the running application come from: the project whose application the open
 * document shows, the address its application answers on, and the routes its page files declare.
 *
 * The document names its project itself, so a document that was connected once keeps its screens
 * wherever it is saved; a document that names none belongs to the project whose repository holds
 * its file. A document outside every project has no pages, which the panel explains instead of
 * guessing.
 */
export function useLivePagesSource() {
  const store = useEditorStore()
  const { projects } = useProjects()

  const documentPath = computed(() => store.getDocumentFilePath())

  /** The project the document was connected to, if it was. */
  const binding = computed<DocumentProject | null>(() => {
    // The binding is plugin data on the document, and the graph itself is not reactive.
    void store.state.sceneVersion
    return readDocumentProject(store)
  })

  const project = computed<Project | null>(() => {
    const stored = binding.value
    if (stored !== null) {
      const listed = projects.value.find((entry) => entry.id === stored.projectId)
      if (listed) return listed
      // The list forgot the project, but the document still names its repository: the screens of
      // that application are read from it, and nothing of it can be started.
      return createProject({ repository: stored.repository })
    }
    const path = documentPath.value
    if (path === null) return null
    const normalized = normalizePath(path)
    return (
      projects.value.find(
        (entry) => normalized === entry.repository || normalized.startsWith(`${entry.repository}/`)
      ) ?? null
    )
  })

  /**
   * Connect the open document to a project, or disconnect it with null, as one undoable edit. A
   * document connected here finds the screens of that application on every machine it is opened
   * on, which is what a person picked the folder for.
   */
  function bind(next: Project | null): void {
    writeDocumentProject(
      store,
      next === null ? null : { projectId: next.id, repository: next.repository }
    )
  }

  /** The address the project's application was configured to answer on, if any. */
  const baseAddress = computed(() => project.value?.startUrl.trim() ?? '')

  /** The routes the project's page files declare, read from git so no walk of the disk is needed. */
  async function listRoutes(): Promise<RouteInfo[]> {
    const current = project.value
    if (!current) return []
    const resolved = await readRepositoryRoot(current.repository)
    const repository = resolved.ok && resolved.value !== null ? resolved.value : current.repository
    const listed = await runGit(repository, 'ls-files', ['--', ...pagePaths(current.appDirectory)])
    if (!listed.ok) return []
    const files = listed.value.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    return routesFromFiles(files)
  }

  /**
   * One frame per route, laid out under a section for each area of the application and linked to
   * the page it shows, as one undo step. A route with a parameter is opened with the value it was
   * given; a route still missing one is left out, since the page it names does not exist yet.
   */
  function openAll(
    routes: readonly RouteInfo[],
    base = baseAddress.value,
    params: Readonly<Record<string, string>> = {}
  ): number {
    // The address a project was configured with is text a person typed; a frame keeps the address
    // the page really has, or none at all.
    const address = normalizeLiveURL(base)
    if (address === '' || routes.length === 0) return 0
    const pages = openedPages(routes, address, params)
    if (pages.length === 0) return 0
    const groups = groupByArea(pages, (page) => areaOf(page.path))
    // Sections and the pages inside them come out in the order the groups do, so each group reads
    // its own layout by the place it holds.
    const layouts = layoutGroups(groups, { width: PAGE_WIDTH, height: PAGE_HEIGHT })
    const pageId = store.state.currentPageId
    let opened = 0
    store.undo.runBatch('Open pages', () => {
      for (const [index, group] of groups.entries()) {
        const layout = layouts[index]
        const section = store.createShape(
          'SECTION',
          layout.section.x,
          layout.section.y,
          layout.section.width,
          layout.section.height,
          pageId,
          group.title
        )
        for (const placed of layout.pages) {
          const id = store.createShape(
            'FRAME',
            placed.at.x,
            placed.at.y,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            section,
            placed.item.name
          )
          const node = store.graph.getNode(id)
          if (!node) continue
          store.updateNodeWithUndo(
            id,
            {
              // A route filled with a value can name a path longer than a frame's label holds.
              pluginData: pluginDataWithLivePage(node, {
                url: placed.item.url,
                label: pageLabel(placed.item.path),
                mode: 'live'
              })
            },
            'Link page'
          )
          opened += 1
        }
      }
    })
    return opened
  }

  return { project, documentPath, binding, bind, baseAddress, listRoutes, openAll }
}

export type LivePagesSource = ReturnType<typeof useLivePagesSource>

/** One page to open: the path it serves, the address it answers on, and the name its frame takes. */
type OpenedPage = {
  path: string
  url: string
  name: string
}

/**
 * The pages the routes serve with the values they were given. A route still missing a value it
 * needs is left out, as is one whose address came out empty, so no frame stands for a page that
 * cannot open.
 */
function openedPages(
  routes: readonly RouteInfo[],
  address: string,
  params: Readonly<Record<string, string>>
): OpenedPage[] {
  const pages: OpenedPage[] = []
  for (const route of routes) {
    const path = route.params.length > 0 ? fillRoute(route.route, params) : route.route
    if (path === null) continue
    const url = routeURL(address, path)
    if (url === '') continue
    pages.push({ path, url, name: pageName(path) })
  }
  return pages
}

/** The name a frame takes for the path it shows: the path without its slash, Home at the root. */
function pageName(path: string): string {
  return path === '/' ? 'Home' : path.replace(/^\//, '')
}
