import { readFile } from '@tauri-apps/plugin-fs'

/**
 * The source file a picked element came from, so a person can see the code the page is made of.
 *
 * The page reports the file its component lives in, and the app reads that file from disk: the
 * element, the panel, and the source are then one story, told in three places. A file is cut to
 * what a panel can show - a thousand-line screen is not something to scroll in a side bar.
 */

/** How many lines of a file a panel keeps, which is more than an element's own source needs. */
export const SOURCE_LINE_LIMIT = 400

/** One file as the panel shows it: its path, its text, and whether it was cut. */
export type ComponentSource = {
  path: string
  text: string
  /** How many lines the file has, which the panel says when it cut the rest. */
  lines: number
  truncated: boolean
}

/** How a file is read, injected so the rules are testable without a desktop build. */
export type SourceRead = (path: string) => Promise<Uint8Array>

/**
 * The text of a component's file, or null when there is no file to read or it cannot be read. A
 * file this app may not open is a panel that says so, not a window that fails.
 */
export async function componentSource(
  path: string | null,
  read: SourceRead = readFile
): Promise<ComponentSource | null> {
  if (path === null || path.trim() === '') return null
  let bytes: Uint8Array
  try {
    bytes = await read(path)
  } catch (error) {
    console.warn('[Screens] The component could not be read:', path, error)
    return null
  }
  const lines = new TextDecoder().decode(bytes).split('\n')
  return {
    path,
    text: lines.slice(0, SOURCE_LINE_LIMIT).join('\n'),
    lines: lines.length,
    truncated: lines.length > SOURCE_LINE_LIMIT
  }
}
