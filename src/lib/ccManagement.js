import { generateCandidateInRange } from './generateCandidateInRange'
import { generateCandidateWithSmallRanks } from './generateCandidateWithSmallRanks'
import { valueOf, MAX_RANK } from './ranks'
import { DEFAULT_TARGET_EV, MIN_TARGET_EV, MAX_TARGET_EV, computeProbs } from './luckyDrop'

function countFillableTiles(tiles) {
  return tiles.flat().filter((s) => s === 'blocked' || s === 'semi').length
}

// Same generation pipeline generatePlacement uses per board position (board
// 0 keeps its small-rank guarantee), but skipping placement/distance-order
// entirely - this only needs the resulting rank multiset, not where each
// item physically lands.
function summarize(board, isFirstBoard, blockedValue, maxRank) {
  const tileCount = countFillableTiles(board.tiles)
  const ranks = isFirstBoard
    ? generateCandidateWithSmallRanks(blockedValue, tileCount, board.minRank, maxRank)
    : generateCandidateInRange(blockedValue, tileCount, board.minRank, maxRank)
  const sum = ranks.reduce((s, r) => s + valueOf(r), 0)
  return { blockedValue, maxRank, tileCount, itemCount: ranks.length, sum, ranks: ranks.sort((a, b) => a - b) }
}

// Previews a board's current queue plus two bigger variants - 30% and 50%
// more blockedValue, with maxRank allowed one rank higher to give the extra
// value somewhere to go - for comparison. Purely informational: nothing
// here reads or writes the board's actual saved semiPlacements/blockedQueue,
// it's a fresh "what would generation produce right now" preview for all
// three, so Current and the suggestions are directly comparable.
export function suggestQueues(board, isFirstBoard) {
  const maxRankBumped = Math.min(board.maxRank + 1, MAX_RANK)
  return {
    current: summarize(board, isFirstBoard, board.blockedValue, board.maxRank),
    plus30: summarize(board, isFirstBoard, Math.round(board.blockedValue * 1.3), maxRankBumped),
    plus50: summarize(board, isFirstBoard, Math.round(board.blockedValue * 1.5), maxRankBumped),
  }
}

// Clamped to the model's own valid range (see luckyDrop.js) so the
// DISPLAYED ev number always matches what its own probs actually reflect -
// computeProbs already clamps internally, but the +30%/+50% suggestions
// are exactly the kind of arithmetic (a moderate base EV times 1.3 or 1.5)
// that can cross the ceiling, and showing e.g. "Target EV: 2.40x" next to
// probabilities computed for 2.33x would be a confusing mismatch.
function summarizeEv(ev) {
  const clamped = Math.min(Math.max(ev, MIN_TARGET_EV), MAX_TARGET_EV)
  return { ev: clamped, probs: computeProbs(clamped) }
}

// Unlike suggestQueues' +30%/+50% (relative to whatever the board's own
// blockedValue already is), these are fixed absolute EV targets - 1.08x and
// 1.12x (8% and 12% more value on average) - not relative to the board's
// current targetEv. Deliberately lower than a relative +30%/+50% of a
// typical ~1.05 base would be; picked directly, not derived from `ev`.
export function suggestEv(board) {
  const ev = board.targetEv ?? DEFAULT_TARGET_EV
  return {
    current: summarizeEv(ev),
    plus8: summarizeEv(1.08),
    plus12: summarizeEv(1.12),
  }
}
