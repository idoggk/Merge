export const DEFAULT_TARGET_EV = 1.05

// Solve (1 + 2k + 4k^2) / (1 + k + k^2) = targetEv for the positive root in
// [0, 1]. p(normal) = 1/(1+k+k^2), p(+1 rank) = p(normal)*k,
// p(+2 ranks) = p(normal)*k^2. See CLAUDE.md's lucky-drop section.
export function solveK(targetEv) {
  const a = 4 - targetEv
  const b = 2 - targetEv
  const c = 1 - targetEv
  const disc = b * b - 4 * a * c
  const sqrtDisc = Math.sqrt(disc)
  const root1 = (-b + sqrtDisc) / (2 * a)
  const root2 = (-b - sqrtDisc) / (2 * a)
  return root1 >= 0 && root1 <= 1 ? root1 : root2
}

// [p(normal), p(+1 rank), p(+2 ranks)], summing to 1.
export function computeProbs(targetEv) {
  const k = solveK(targetEv)
  const denom = 1 + k + k * k
  return [1 / denom, k / denom, (k * k) / denom]
}

// Deterministic deficit round-robin scheduler: repeated calls emit 0/1/2
// (bonus rank steps) whose long-run frequency converges to `probs`, with no
// randomness — the simulation stays fully reproducible instead of needing
// Monte Carlo sampling, per the app's existing expected-value convention.
export function createEvScheduler(probs) {
  const counts = probs.map(() => 0)
  let total = 0
  return function next() {
    total += 1
    let bestIdx = 0
    let bestDeficit = -Infinity
    for (let i = 0; i < probs.length; i++) {
      const deficit = probs[i] * total - counts[i]
      if (deficit > bestDeficit) {
        bestDeficit = deficit
        bestIdx = i
      }
    }
    counts[bestIdx] += 1
    return bestIdx
  }
}
