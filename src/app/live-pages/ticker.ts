/**
 * One animation frame for everyone who has to follow the canvas.
 *
 * The canvas draws where a layer is, and a layer being dragged is drawn from a preview that is not
 * an edit: it never reaches the versions a computed value listens to. Anything drawn over the canvas
 * therefore reads the graph once a frame, and this is that frame - one loop for every reader,
 * instead of one loop each and a pile of them left running when a component goes away.
 */

type Listener = () => void

const listeners = new Set<Listener>()
let frame = 0

function step(): void {
  for (const listener of listeners) listener()
  frame = listeners.size === 0 ? 0 : requestAnimationFrame(step)
}

/** Follow the canvas until the returned function is called. */
export function onFrameTick(listener: Listener): () => void {
  listeners.add(listener)
  if (frame === 0) frame = requestAnimationFrame(step)
  return () => {
    listeners.delete(listener)
  }
}
