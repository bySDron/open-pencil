import { computed, ref, shallowRef } from 'vue'

import { importProject, type ProjectImportOutcome } from '@/app/projects/import'
import { desktopProjectImport } from '@/app/projects/pick'
import {
  applicationAddress,
  ensureProjectRun,
  projectRun,
  type ProjectRunState
} from '@/app/projects/runner'
import type { Project } from '@/app/projects/schema'
import { useProjects } from '@/app/projects/store'
import { canRunHostProcesses } from '@/app/tauri/capabilities'

import type { LivePagesSource } from './open'

/** How far a connection has come, which the panel says in its own words as it goes. */
export type ConnectPhase =
  | 'idle'
  | 'choosing'
  | 'starting'
  | 'waiting'
  | 'opening'
  | 'done'
  | 'failed'

/** Why a connection produced nothing, in the words the panel explains it with. */
export type ConnectFailure =
  | 'cancelled'
  | 'not-repository'
  | 'unavailable'
  | 'no-application'
  | 'no-address'
  | 'no-routes'

/** What connecting a project asks of the outside; injected so the flow is testable alone. */
export type ScreensConnectionIo = {
  /** Ask for the folder of a project, and add what it holds to the list of projects. */
  chooseProject: () => Promise<ProjectImportOutcome>
  /** Start the project's application, or leave the run it already has alone. */
  startApplication: (project: Project) => Promise<void>
  /** The address the application answers on, or empty when it never said. */
  waitForAddress: (project: Project, budgetMs?: number) => Promise<string>
}

/** How long a dev server has to name its address before the connection gives up on it. */
export const ADDRESS_BUDGET_MS = 90_000

/** How often the run's own output is read while waiting for an address. */
const ADDRESS_STEP_MS = 250

/**
 * The address a project's application answers on, once it has said so. A project whose command
 * names its port already knows; any other dev server prints its address when it is ready, and a
 * run that failed or exited stops the wait rather than holding the panel for the whole budget.
 */
export async function waitForApplicationAddress(
  project: Project,
  budgetMs: number = ADDRESS_BUDGET_MS,
  stepMs: number = ADDRESS_STEP_MS
): Promise<string> {
  const run = projectRun(project.id)
  const deadline = Date.now() + budgetMs
  for (;;) {
    const address = applicationAddress(project, run.output.value)
    if (address !== '') return address
    const state: ProjectRunState = run.state.value
    if (state === 'failed' || state === 'stopped') return ''
    // A project nothing was started for never prints an address, so waiting would only be quiet.
    if (state === 'idle') return ''
    if (Date.now() >= deadline) return ''
    await new Promise((resolve) => {
      setTimeout(resolve, stepMs)
    })
  }
}

/** The desktop's own connection: the folder picker, the runner, and the run's printed address. */
export function desktopScreensConnection(): ScreensConnectionIo {
  const projects = useProjects()
  return {
    async chooseProject() {
      const outcome = await importProject(desktopProjectImport, 'Choose the project folder')
      if (outcome.kind === 'added') projects.add(outcome.project)
      return outcome
    },
    async startApplication(project) {
      if (!canRunHostProcesses()) return
      await ensureProjectRun(project)
    },
    waitForAddress: (project, budgetMs) => waitForApplicationAddress(project, budgetMs)
  }
}

/**
 * Connecting a document to the application whose screens it should show, in one action: a folder
 * is picked, the project is stored and named by the document, its dev server is started, and the
 * screens of its pages are laid out on the canvas. What used to be five steps — a project, an
 * address, a document, a run, and a button — is the folder a person already has.
 */
export function useScreensConnection(
  source: LivePagesSource,
  io: ScreensConnectionIo = desktopScreensConnection()
) {
  const phase = ref<ConnectPhase>('idle')
  const failure = shallowRef<ConnectFailure | null>(null)

  /** Whether a connection is under way, so a second press does not start another run. */
  const busy = computed(
    () =>
      phase.value === 'choosing' ||
      phase.value === 'starting' ||
      phase.value === 'waiting' ||
      phase.value === 'opening'
  )

  /**
   * Show the screens of a project already named by the document: start the application if it is
   * not up, wait for the address it answers on, and open whatever the canvas is still missing.
   */
  async function open(target: Project, fallbackAddress = ''): Promise<boolean> {
    if (busy.value) return false
    failure.value = null
    const canStart = target.startCommand.trim() !== ''
    if (!canStart && target.startUrl.trim() === '' && fallbackAddress === '') {
      failure.value = 'no-application'
      phase.value = 'failed'
      return false
    }
    phase.value = 'starting'
    if (canStart) await io.startApplication(target)
    phase.value = 'waiting'
    const address =
      target.startUrl.trim() !== '' || !canStart
        ? target.startUrl.trim() || fallbackAddress
        : (await io.waitForAddress(target)) || fallbackAddress
    if (address === '') {
      failure.value = 'no-address'
      phase.value = 'failed'
      return false
    }
    phase.value = 'opening'
    const routes = await source.listRoutes()
    if (routes.length === 0) {
      failure.value = 'no-routes'
      phase.value = 'failed'
      return false
    }
    const opened = source.openAll(routes, address)
    phase.value = opened === 0 ? 'failed' : 'done'
    if (opened === 0) failure.value = 'no-address'
    return opened > 0
  }

  /** Pick the folder of a project, name it in the document, and show its screens. */
  async function connect(): Promise<boolean> {
    if (busy.value) return false
    failure.value = null
    phase.value = 'choosing'
    const outcome = await io.chooseProject()
    if (outcome.kind !== 'added') {
      phase.value = outcome.kind === 'cancelled' ? 'idle' : 'failed'
      failure.value =
        outcome.kind === 'cancelled'
          ? 'cancelled'
          : outcome.kind === 'notRepository'
            ? 'not-repository'
            : 'unavailable'
      return false
    }
    source.bind(outcome.project)
    // The folder is chosen: the rest of the journey is the one a connected document makes, and it
    // answers for the run it starts rather than for the dialog that named it.
    phase.value = 'idle'
    return open(outcome.project)
  }

  /**
   * The same journey for a document that already names a project: the panel asks for it on
   * opening, so screens appear without a press, the way a project's application starts itself.
   */
  async function ensure(fallbackAddress = ''): Promise<boolean> {
    const target = source.project.value
    if (target === null || busy.value) return false
    return open(target, fallbackAddress)
  }

  return { phase, failure, busy, connect, ensure, open }
}

export type ScreensConnection = ReturnType<typeof useScreensConnection>
