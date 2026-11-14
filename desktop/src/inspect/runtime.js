// The inspector that OpenPencil injects into every frame of its window.
//
// A live page belongs to the dev server, which is another origin: the app cannot read the page's
// document, and a frame cannot reach the app's. This script therefore runs inside the page itself
// and answers the app over `postMessage`, which both sides may do. It only ever holds what a
// person is looking at - the element under the pointer, its rectangle, the styles the page
// computes for it - and never sends the page's content anywhere but to the window that embedded it.
;(() => {
  if (window === window.top) return
  if (window.__openPencilInspectInstalled) return
  window.__openPencilInspectInstalled = true

  const SOURCE = 'open-pencil-inspect'
  const HOST = 'open-pencil-host'
  const STYLE_KEYS = [
    'display',
    'width',
    'height',
    'gap',
    'padding',
    'font-size',
    'font-weight',
    'line-height',
    'color',
    'background-color',
    'border-radius',
    'border-width',
    'border-color',
    'opacity'
  ]
  const SKIPPED = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'HEAD',
    'META',
    'LINK',
    'TITLE'
  ])
  const MAX_DEPTH = 14
  const MAX_NODES = 800
  const TEXT_LIMIT = 60
  const CLASS_LIMIT = 3

  let picking = false
  let hovered = null
  let picked = null
  let elements = []
  const written = new Map()

  const overlay = document.createElement('div')
  overlay.setAttribute('data-openpencil-inspect', 'overlay')
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    boxSizing: 'border-box',
    border: '2px solid #2f6bff',
    background: 'rgba(47,107,255,0.12)',
    borderRadius: '2px',
    display: 'none'
  })

  const hoverBox = document.createElement('div')
  hoverBox.setAttribute('data-openpencil-inspect', 'hover')
  Object.assign(hoverBox.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483646',
    boxSizing: 'border-box',
    border: '1px solid rgba(47,107,255,0.7)',
    background: 'rgba(47,107,255,0.06)',
    display: 'none'
  })

  function mountOverlay() {
    const parent = document.body || document.documentElement
    if (!parent) return
    if (!overlay.isConnected) parent.appendChild(overlay)
    if (!hoverBox.isConnected) parent.appendChild(hoverBox)
  }

  function rectOf(element) {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }

  function place(box, rect) {
    if (!rect || rect.width === 0 || rect.height === 0) {
      box.style.display = 'none'
      return
    }
    box.style.display = 'block'
    box.style.left = rect.x + 'px'
    box.style.top = rect.y + 'px'
    box.style.width = rect.width + 'px'
    box.style.height = rect.height + 'px'
  }

  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type, payload }, '*')
    } catch {
      // A page that has been navigated away has no parent to answer.
    }
  }

  function componentOf(element) {
    let instance = element.__vueParentComponent
    let guard = 0
    while (instance && guard < 32) {
      const type = instance.type
      const file = type && type.__file
      if (typeof file === 'string' && file !== '') {
        const name =
          typeof type.__name === 'string' && type.__name !== '' ? type.__name : fileName(file)
        return { name, file }
      }
      instance = instance.parent
      guard += 1
    }
    return null
  }

  function fileName(path) {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] || path
  }

  function textOf(element) {
    let text = ''
    for (const child of element.childNodes) {
      if (child.nodeType === 3) text += child.nodeValue || ''
      if (text.length > TEXT_LIMIT) break
    }
    return text.trim().replace(/\s+/g, ' ').slice(0, TEXT_LIMIT)
  }

  function describe(element, id, parentId, depth) {
    return {
      id,
      parentId,
      depth,
      tag: element.tagName.toLowerCase(),
      classes: Array.prototype.slice.call(element.classList, 0, CLASS_LIMIT),
      text: textOf(element),
      rect: rectOf(element),
      component: componentOf(element)
    }
  }

  function visible(element) {
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return true
  }

  function walk(root) {
    const nodes = []
    elements = []
    const queue = [{ element: root, parentId: null, depth: 0 }]
    while (queue.length > 0 && nodes.length < MAX_NODES) {
      const item = queue.shift()
      const element = item.element
      if (SKIPPED.has(element.tagName)) continue
      if (item.depth > 0 && !visible(element)) continue
      const id = String(nodes.length)
      nodes.push(describe(element, id, item.parentId, item.depth))
      elements.push(element)
      if (item.depth >= MAX_DEPTH) continue
      for (const child of element.children) {
        queue.push({ element: child, parentId: id, depth: item.depth + 1 })
      }
    }
    return nodes
  }

  function readStyles(element) {
    const computed = window.getComputedStyle(element)
    const styles = {}
    for (const key of STYLE_KEYS) styles[key] = (computed.getPropertyValue(key) || '').trim()
    return styles
  }

  function pick(element) {
    picked = element
    mountOverlay()
    place(overlay, rectOf(element))
    send('picked', { pick: { node: describe(element, '', null, 0), styles: readStyles(element) } })
  }

  function pickAt(x, y) {
    const element = document.elementFromPoint(x, y)
    if (!element || element === overlay || element === hoverBox) return null
    if (element === document.body || element === document.documentElement) return null
    return element
  }

  function onMove(event) {
    if (!picking) return
    const element = pickAt(event.clientX, event.clientY)
    hovered = element
    place(hoverBox, element ? rectOf(element) : null)
    send('hover', { rect: element ? rectOf(element) : null })
  }

  function onClick(event) {
    if (!picking) return
    const element = pickAt(event.clientX, event.clientY)
    if (!element) return
    event.preventDefault()
    event.stopPropagation()
    picking = false
    place(hoverBox, null)
    pick(element)
  }

  function start() {
    mountOverlay()
    picking = true
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
  }

  function stop() {
    picking = false
    hovered = null
    place(hoverBox, null)
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
  }

  function clear() {
    stop()
    picked = null
    overlay.style.display = 'none'
  }

  function applyStyle(key, value) {
    if (!picked) return
    if (value === '') {
      picked.style.removeProperty(key)
      written.delete(key)
    } else {
      picked.style.setProperty(key, value)
      written.set(key, value)
    }
    send('styles', { styles: readStyles(picked), rect: rectOf(picked) })
  }

  function resetStyles() {
    if (!picked) return
    for (const key of written.keys()) picked.style.removeProperty(key)
    written.clear()
    send('styles', { styles: readStyles(picked), rect: rectOf(picked) })
  }

  function onMessage(event) {
    const data = event.data
    if (!data || typeof data !== 'object' || data.source !== HOST) return
    switch (data.type) {
      case 'ping':
        send('ready', {})
        break
      case 'start':
        start()
        break
      case 'stop':
        stop()
        break
      case 'tree':
        send('tree', { nodes: walk(document.body || document.documentElement) })
        break
      case 'select': {
        const element = elements[Number(data.id)]
        if (element) pick(element)
        break
      }
      case 'style':
        applyStyle(data.key, data.value)
        break
      case 'reset':
        resetStyles()
        break
      case 'clear':
        clear()
        break
      default:
        break
    }
  }

  window.addEventListener('message', onMessage)

  // A page that has just loaded keeps the element a person left picked out of its sight until the
  // app asks again, so the overlay is created here rather than only when something is picked.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountOverlay()
      send('ready', {})
    })
  } else {
    mountOverlay()
    send('ready', {})
  }
})()
