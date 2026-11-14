import { resolve } from 'node:path'
import process from 'node:process'

import { normalizePath, type ProxyOptions, type ServerOptions } from 'vite'

const WATCHED_MARKDOWN_ROOTS = ['/src/', '/packages/core/src/', '/packages/vue/src/']

/**
 * Where a live page is served from our own address, which is what the canvas needs of it.
 *
 * A page of another origin cannot be read, clicked into, or drawn into a texture: only its own
 * documents may touch its pixels. Serving it under this server's origin makes it one of ours, and
 * the canvas can then rasterize and inspect it directly. The application is started with this same
 * prefix as its base path, so every address it emits already carries it and nothing is rewritten.
 */
export const LIVE_PAGE_PREFIX = '/live'

/** The address a project's application answers on, forwarded under `LIVE_PAGE_PREFIX`. */
export function livePageProxy(port: number): Record<string, ProxyOptions> {
  const prefix = `${LIVE_PAGE_PREFIX}/${port}`
  return {
    [prefix]: {
      target: `http://localhost:${port}`,
      // The dev server's own update channel is a WebSocket on the same prefix, so an edit in the
      // application still reloads the page it is looking at.
      ws: true,
      changeOrigin: false
    }
  }
}

function ignoreMarkdownOutsideSource(path: string): boolean {
  const normalized = normalizePath(path)
  if (!normalized.endsWith('.md')) return false
  return !WATCHED_MARKDOWN_ROOTS.some((root) => normalized.includes(root))
}

export const WATCH_IGNORED = [
  // Editors that save atomically leave temp files beside the source; watching them fails EBUSY.
  '**/*.tmpdir/**',
  '**/*.tmp',
  // Cargo writes and locks its artifacts here while the desktop app builds.
  '**/target/**',
  // Storybook builds into these folders; watching a bundle it rewrites fails EBUSY on Windows.
  '**/storybook-static/**',
  '**/dist/**',
  '**/dist-metrics/**',
  '**/desktop/**',
  '**/packages/cli/**',
  '**/packages/mcp/**',
  '**/packages/docs/**',
  '**/tests/**',
  '**/.github/**',
  '**/.pi/**',
  ignoreMarkdownOutsideSource
]

function hmrOptions(host: string | undefined, hmrURL: string | undefined): ServerOptions['hmr'] {
  if (!hmrURL) return host ? { protocol: 'ws', host, port: 1421 } : undefined
  const url = new URL(hmrURL)
  const secure = url.protocol === 'https:'
  return {
    protocol: secure ? 'wss' : 'ws',
    host: url.hostname,
    clientPort: Number(url.port || (secure ? 443 : 80))
  }
}

/** The ports of the applications this server forwards, which a caller names for the prototype. */
function livePagePorts(): number[] {
  const raw = process.env.OPENPENCIL_LIVE_PORTS ?? ''
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((port) => Number.isInteger(port) && port > 0)
}

/**
 * `hmrURL` is the server's own public address, for pages another server serves: the Cloud server
 * forwards their files here in `cloud:dev` but not WebSockets, so updates connect here directly.
 */
export function createDevServerOptions(
  host: string | undefined,
  rootDir: string,
  hmrURL?: string
): ServerOptions {
  const ports = livePagePorts()
  return {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: hmrOptions(host, hmrURL),
    proxy: ports.length === 0 ? undefined : Object.assign({}, ...ports.map(livePageProxy)),
    // Vite forwards browser logs to the terminal when an agent starts it. Vue warnings carry the
    // component's props, and serializing the editor state behind them freezes the tab, so only
    // errors are forwarded.
    forwardConsole: { unhandledErrors: true, logLevels: ['error'] },
    watch: {
      // Ignore nested checkouts, not an active checkout whose own path contains .worktrees.
      ignored: [...WATCH_IGNORED, `${normalizePath(resolve(rootDir, '.worktrees'))}/**`]
    }
  }
}
