import { computed, ref, shallowRef } from 'vue'

import { importProject, type ProjectImportOutcome } from '@/app/projects/import'
import { desktopProjectImport } from '@/app/projects/pick'
import {
  ensureProjectRun,
  printedAddress,
  projectRun,
  type ProjectRunState
} from '@/app/projects/runner'
import type { Project } from '@/app/projects/schema'
import { useProjects } from '@/app/projects/store'
import { canRunHostProcesses } from '@/app/tauri/capabilities'

import { reachableAddress } from './address'
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
  | 'failed'
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
  /** The spelling of an address that answers, or empty when none does. */
  reachable?: (address: string) => Promise<string>
}

/** How long a dev server has to name its address before the connection gives up on it. */
export const ADDRESS_BUDGET_MS = 90_000
/**
 * How long a project whose command already named a port is given to announce its own address.
 * The guess is a fallback for a server started elsewhere; a server this panel started says which
 * loopback it took in its first seconds, and the guess may well name the other one.
 */
export const KNOWN_PORT_BUDGET_MS = 12_000

/** How often the run's own output is read while waiting for an address. */
const ADDRESS_STEP_MS = 250

/**
 * The address a project's application answers on, once it has said so. A dev server prints the
 * address it really bound, and that is the address a page can be opened at; a project whose
 * command only named a port has a guess to fall back on, and a run that failed or exited stops
 * the wait rather than holding the panel for the whole budget.
 */
export async function waitForApplicationAddress(
  project: Project,
  budgetMs: number = ADDRESS_BUDGET_MS,
  stepMs: number = ADDRESS_STEP_MS
): Promise<string> {
  const run = projectRun(project.id)
  const deadline = Date.now() + budgetMs
  for (;;) {
    const address = printedAddress(run.output.value)
    if (address !== '') return address
    const state: ProjectRunState = run.state.value
    if (state === 'failed' || state === 'stopped' || state === 'idle') return ''
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
    waitForAddress: (project, budgetMs) =>
      waitForApplicationAddress(
        project,
        budgetMs ?? (project.startUrl.trim() === '' ? ADDRESS_BUDGET_MS : KNOWN_PORT_BUDGET_MS)
      ),
    reachable: (address) => reachableAddress(address)
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
  /** The words the outside gave for a failure, which no message of ours can say better. */
  const reason = ref('')

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
    // The server's own announcement first, since only it knows which loopback it took; a guess
    // from the command line is what a project that started elsewhere has.
    const announced = canStart ? await io.waitForAddress(target) : ''
    const address = announced || target.startUrl.trim() || fallbackAddress
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
    // The address a page is opened at has to be one that answers: a dev server binds one loopback
    // spelling, and the other one is a connection that never opens.
    const reachable = io.reachable === undefined ? address : await io.reachable(address)
    if (reachable === '') {
      failure.value = 'no-address'
      phase.value = 'failed'
      return false
    }
    // Pages already on the canvas follow the application to where it answers now.
    source.realign(reachable)
    source.openAll(routes, reachable)
    phase.value = 'done'
    return true
  }

  /** Pick the folder of a project, name it in the document, and show its screens. */
  async function connect(): Promise<boolean> {
    if (busy.value) return false
    failure.value = null
    reason.value = ''
    phase.value = 'choosing'
    const outcome = await io.chooseProject()
    if (outcome.kind !== 'added') {
      if (outcome.kind === 'cancelled') {
        phase.value = 'idle'
        failure.value = 'cancelled'
      } else if (outcome.kind === 'failed') {
        // The reason the dialog or the detector gave is what a person can act on, so it is kept.
        phase.value = 'failed'
        failure.value = 'failed'
        reason.value = outcome.reason
      } else {
        phase.value = 'failed'
        failure.value = outcome.kind === 'notRepository' ? 'not-repository' : 'unavailable'
        reason.value = ''
      }
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

  return { phase, failure, reason, busy, connect, ensure, open }
}

export type ScreensConnection = ReturnType<typeof useScreensConnection>
