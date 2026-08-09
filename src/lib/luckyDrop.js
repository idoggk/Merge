export const DEFAULT_TARGET_EV = 1.05

// The geometric-decay model (see solveK below) only has a valid root in
// [0, 1] for targetEv in [1, 7/3] - at k=0, EV=1 (never a bonus); at k=1,
// EV=(1+2+4)/(1+1+1)=7/3 (as close to evenly-split as the model allows).
// Past that ceiling there's no valid 3-outcome distribution at all.
// MIN_TARGET_EV/MAX_TARGET_EV are exported so UI callers (the editor's
// "Lucky drops" card) can cap input at the source, not just downstream.
export const MIN_TARGET_EV = 1
export const MAX_TARGET_EV = 7 / 3

// Solve (1 + 2k + 4k^2) / (1 + k + k^2) = targetEv for the positive root in
// [0, 1]. p(normal) = 1/(1+k+k^2), p(+1 rank) = p(normal)*k,
// p(+2 ranks) = p(normal)*k^2. See CLAUDE.md's lucky-drop section.
//
// targetEv is clamped to [MIN_TARGET_EV, MAX_TARGET_EV] before solving -
// outside that range the quadratic has no root in [0,1] at all, and would
// otherwise silently return something outside it (negative k, or k>1),
// which turns into a negative or >100% "probability" downstream. This
// isn't just a defensive-for-no-reason clamp: targetEv is a live,
// user-editable board field (and CC Management's +30%/+50% EV suggestions
// can push even a moderate base value past the ceiling), so an
// out-of-range input is a real, easy-to-hit case now, not a hypothetical.
export function solveK(targetEv) {
  const clamped = Math.min(Math.max(targetEv, MIN_TARGET_EV), MAX_TARGET_EV)
  const a = 4 - clamped
  const b = 2 - clamped
  const c = 1 - clamped
  const disc = b * b - 4 * a * c
  const sqrtDisc = Math.sqrt(disc)
  const root1 = (-b + sqrtDisc) / (2 * a)
  const root2 = (-b - sqrtDisc) / (2 * a)
  // At clamped === MAX_TARGET_EV exactly, the true root1 is exactly 1 - but
  // MAX_TARGET_EV (7/3) isn't exactly representable in floating point, so
  // root1 can come out a hair above 1 (e.g. 1.0000000000000002) and fail a
  // strict `<= 1` check, wrongly falling through to root2 (a genuinely
  // different, negative root) instead of the intended "clamp the tiny
  // overshoot back to 1". The epsilon absorbs that float noise at both
  // boundaries; the final clamp below still snaps the tiny overshoot itself.
  const EPS = 1e-9
  const k = root1 >= -EPS && root1 <= 1 + EPS ? root1 : root2
  return Math.min(Math.max(k, 0), 1)
}

// [p(normal), p(+1 rank), p(+2 ranks)], summing to 1.
export function computeProbs(targetEv) {
  const k = solveK(targetEv)
  const denom = 1 + k + k * k
  return [1 / denom, k / denom, (k * k) / denom]
}

// A single true-random roll of 0/1/2 bonus rank steps, weighted by `probs` -
// for the interactive play tester, where a real player expects genuine
// unpredictability on every tap, not a converging sequence. Deliberately
// separate from createEvScheduler below (used by the automatic simulator,
// which wants reproducible aggregate EV math, not player-facing randomness).
export function rollBonus(probs) {
  const roll = Math.random()
  if (roll < probs[0]) return 0
  if (roll < probs[0] + probs[1]) return 1
  return 2
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
