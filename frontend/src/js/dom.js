/**
 * Tiny DOM lookup cache.
 *
 * Every element we touch lives for the lifetime of the page, so repeated
 * `getElementById` calls are wasted work. The cache self-heals if an element
 * is ever replaced.
 */
const cache = new Map();

export function byId(id) {
  let el = cache.get(id);
  if (el && el.isConnected) return el;

  el = document.getElementById(id);
  if (el) cache.set(id, el);
  return el;
}
