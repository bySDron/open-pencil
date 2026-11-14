/**
 * The address a page of the running application is opened at.
 *
 * A dev server binds one loopback - on Windows usually `::1` - and only that one answers. A command
 * line that names a port says nothing about which it took, so `localhost` and `127.0.0.1` are two
 * spellings of one application and only a probe can say which spelling reaches it.
 */

/** How long one address is given to answer before it counts as unreachable. */
export const REACHABLE_TIMEOUT_MS = 1500

/** The loopback spellings of one address: the one given, then the other name for this machine. */
export function loopbackTwins(address: string): string[] {
  let parsed: URL
  try {
    parsed = new URL(address)
  } catch {
    return [address]
  }
  if (parsed.hostname === 'localhost') return [address, address.replace('localhost', '127.0.0.1')]
  if (parsed.hostname === '127.0.0.1') return [address, address.replace('127.0.0.1', 'localhost')]
  return [address]
}

/**
 * The address a page moves to when the application it belongs to moved: the same path and query on
 * the new origin. Answers null for a page already on that origin, and for an address it cannot read.
 */
export function relocatedPage(url: string, address: string): string | null {
  let page: URL
  let base: URL
  try {
    page = new URL(url)
    base = new URL(address)
  } catch {
    return null
  }
  if (page.origin === base.origin) return null
  return `${base.origin}${page.pathname}${page.search}`
}

/** Whether a page answers at all, asked without reading it: an opaque answer still answers. */
export async function answersAt(
  url: string,
  timeoutMs: number = REACHABLE_TIMEOUT_MS
): Promise<boolean> {
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    })
    return true
  } catch {
    // A browser build, a refused connection, and a server still starting all answer nothing.
    return false
  }
}

/**
 * The spelling of an address that really answers, or empty when none does. The address as given is
 * asked first, so a server that answers where it says costs one probe.
 */
export async function reachableAddress(
  address: string,
  probe: (url: string) => Promise<boolean> = (url) => answersAt(url)
): Promise<string> {
  for (const candidate of loopbackTwins(address)) {
    if (await probe(candidate)) return candidate
  }
  return ''
}
