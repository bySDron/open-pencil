import { shallowRef } from 'vue'

/** A screen the canvas hands to the chat: where the agent works, and what it is asked. */
export type ScreenTask = {
  /** The folder the screen's copy is checked out in. */
  folder: string
  /** What the agent is asked, written for a coding agent. */
  prompt: string
}

/** The task waiting for the chat, which the panel takes once and runs. */
export const pendingScreenTask = shallowRef<ScreenTask | null>(null)

const folder = shallowRef<string | null>(null)

/**
 * Ask the chat to work on one screen. From then on the coding agent starts in the copy's own
 * folder rather than the app's workspace, and the task waits in the composer to be sent.
 */
export function startScreenTask(task: ScreenTask): void {
  folder.value = task.folder
  pendingScreenTask.value = task
}

/**
 * The folder the agent starts in, or null while no screen asked for one. The app's own workspace
 * stays the default, so a chat that never touched a screen reads as it always did.
 */
export function screenFolder(): string | null {
  return folder.value
}

/** The task waiting for the chat, taken so it runs once. */
export function takeScreenTask(): ScreenTask | null {
  const task = pendingScreenTask.value
  pendingScreenTask.value = null
  return task
}
