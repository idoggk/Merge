const PASSES = 3

// A few passes of probabilistic adjacent swaps over an ascending sequence.
// noise=0 leaves the sequence strictly ascending; higher noise lets it dip
// and recover locally without disturbing the overall increasing trend.
export function buildNoisyQueue(items, noise) {
  const queue = [...items]
  const p = Math.min(Math.max(noise, 0), 1)
  if (p === 0) return queue

  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < queue.length - 1; i++) {
      if (Math.random() < p) {
        const tmp = queue[i]
        queue[i] = queue[i + 1]
        queue[i + 1] = tmp
      }
    }
  }

  return queue
}
