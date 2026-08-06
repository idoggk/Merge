import { computeDistances } from './boardDistance'
import { buildNoisyQueue } from './buildNoisyQueue'
import { generateCandidateInRange } from './generateCandidateInRange'
import { generateCandidateWithSmallRanks } from './generateCandidateWithSmallRanks'

function fillableTiles(tiles) {
  const positions = []
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[r].length; c++) {
      if (tiles[r][c] === 'blocked' || tiles[r][c] === 'semi') {
        positions.push({ row: r, col: c })
      }
    }
  }
  return positions
}

// Distance-to-player queue, closest tile first. Ties break row-major so
// results are stable; buildNoisyQueue supplies the actual local variance.
function orderByDistance(positions, distances) {
  return [...positions].sort((a, b) => {
    const da = distances[a.row][a.col]
    const db = distances[b.row][b.col]
    if (da !== db) return da - db
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })
}

// Full placement pipeline for one board: generate items (exact sum to
// blockedValue), order blocked/semi tiles by distance-to-open-tile, run the
// ascending item list through the noisy queue, then assign positionally.
// isFirstBoard scopes the small-rank guarantee to board index 0 only.
export function placeItems(board, { isFirstBoard = false, noise = 0.15 } = {}) {
  const { tiles, blockedValue, minRank, maxRank } = board
  const positions = fillableTiles(tiles)
  const distances = computeDistances(tiles)
  const orderedPositions = orderByDistance(positions, distances)

  const ranks = isFirstBoard
    ? generateCandidateWithSmallRanks(blockedValue, positions.length)
    : generateCandidateInRange(blockedValue, positions.length, minRank, maxRank)

  const queue = buildNoisyQueue(ranks, noise)

  const placements = orderedPositions.map((pos, i) => ({
    ...pos,
    rank: queue[i] ?? null,
  }))

  return {
    placements,
    itemCount: ranks.length,
    tileCount: positions.length,
    sum: ranks.reduce((s, r) => s + 2 ** (r - 1), 0),
  }
}
