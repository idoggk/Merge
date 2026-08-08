import { generateCandidateInRange } from './generateCandidateInRange'
import { generateCandidateWithSmallRanks } from './generateCandidateWithSmallRanks'
import { valueOf, MAX_RANK } from './ranks'

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
