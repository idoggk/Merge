const PASSES = 3

// A few passes of probabilistic adjacent swaps over an ascending sequence.
// noise=0 leaves the sequence strictly ascending; higher noise lets it dip
// and recover locally without disturbing the overall increasing trend.
//
// Position 0 is pinned - the swap loop starts at index 1, so whatever the
// caller's already-ascending input holds first (the true smallest item)
// always stays first. Without this, the same noise applied uniformly across
// the whole sequence has roughly a 1-in-3 chance (at the default noise=0.15,
// 3 passes) of bumping something bigger into the very first reveal slot
// whenever the smallest item is a singleton at the front - a startlingly
// common case (e.g. one leftover rank-1), not the occasional local dip the
// noise is meant to model.
export function buildNoisyQueue(items, noise) {
  const queue = [...items]
  const p = Math.min(Math.max(noise, 0), 1)
  if (p === 0 || queue.length < 2) return queue

  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 1; i < queue.length - 1; i++) {
      if (Math.random() < p) {
        const tmp = queue[i]
        queue[i] = queue[i + 1]
        queue[i + 1] = tmp
      }
    }
  }

  return queue
}
