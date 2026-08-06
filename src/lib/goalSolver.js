import { valueOf, MAX_RANK } from './ranks'
import { placeItems } from './placement'
import { simulatePlaythrough } from './mergeSimulation'

// valueOf(MAX_RANK) is the entire chain's total value (a single rank-12
// item) — no board's subsidy should ever need to exceed it, and generation
// can't safely go above it anyway (it would decompose into invalid rank-13+
// items).
const CEILING = valueOf(MAX_RANK)
const MAX_ITERATIONS = 40

function attempt(board, blockedValue, drBudget, targetRank) {
  const candidateBoard = { ...board, blockedValue }
  // noise=0 keeps generation deterministic — the search assumes a given
  // blockedValue always produces the same outcome, which random queue
  // shuffling would break.
  const generated = placeItems(candidateBoard, { isFirstBoard: true, noise: 0 })
  const simBoard = { ...candidateBoard, semiPlacements: generated.semiPlacements, blockedQueue: generated.blockedQueue }
  const result = simulatePlaythrough(simBoard, { drBudget })
  return { ok: result.reachedAt[targetRank] !== undefined, blockedValue, generated, result }
}

// Board-1-only goal solver: holding the board's painted tile layout fixed,
// binary-searches blockedValue for the smallest subsidy that lets the
// simulated playthrough reach targetRank within drBudget DR. Assumes more
// subsidy never hurts reaching a target sooner — true in practice for this
// engine's greedy merge model, though not mathematically guaranteed for
// every edge case (best-effort, same spirit as the rest of generation).
export function solveBoardOneGoal(board, { drBudget, targetRank }) {
  let high = valueOf(targetRank)
  let best = null

  while (high <= CEILING) {
    const result = attempt(board, high, drBudget, targetRank)
    if (result.ok) {
      best = result
      break
    }
    high *= 2
  }

  if (!best) {
    return { feasible: false }
  }

  let lo = 0
  let hi = best.blockedValue
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const midResult = attempt(board, mid, drBudget, targetRank)
    if (midResult.ok) {
      hi = mid
      best = midResult
    } else {
      lo = mid
    }
  }

  return {
    feasible: true,
    blockedValue: best.blockedValue,
    semiPlacements: best.generated.semiPlacements,
    blockedQueue: best.generated.blockedQueue,
    drSpentToTarget: best.result.reachedAt[targetRank],
  }
}
