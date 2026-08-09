import { DEFAULT_TARGET_EV } from './luckyDrop'

export function emptyTiles(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'open'))
}

// Resize a tile grid to rows x cols, preserving overlapping cells (top-left
// aligned) and defaulting new cells to "open".
export function resizeTiles(tiles, rows, cols) {
  const next = emptyTiles(rows, cols)
  for (let r = 0; r < Math.min(rows, tiles.length); r++) {
    for (let c = 0; c < Math.min(cols, tiles[r].length); c++) {
      next[r][c] = tiles[r][c]
    }
  }
  return next
}

export function createBoard(name, { rows = 5, cols = 8 } = {}) {
  return {
    id: crypto.randomUUID(),
    name,
    rows,
    cols,
    tiles: emptyTiles(rows, cols),
    blockedValue: 0,
    minRank: 1,
    maxRank: 12,
    // Generator lucky-drop EV multiple - see luckyDrop.js. One shared value
    // per board (still not per-tier), configurable in the "Lucky drops"
    // editor card; only takes effect once the player holds a rank-7+ item.
    targetEv: DEFAULT_TARGET_EV,
    // Generated item layout, persisted so it survives reload and so the
    // upcoming playthrough simulation has a fixed, reproducible board to run
    // against. semiPlacements are grid-fixed ({row, col, rank}); blockedQueue
    // is position-independent — which physical tile each entry lands on is
    // decided at simulation time, only the reveal order is controlled here.
    semiPlacements: [],
    blockedQueue: [],
    // Board-1-only onboarding checkpoint: "a player with this much DR should
    // reach this rank." Feeds generation (a reserved, front-loaded slice of
    // blockedValue) rather than overriding it — null means no goal is set.
    onboardingDrBudget: null,
    onboardingTargetRank: null,
    onboardingStatus: null,
  }
}

// The board grid's own rendered width (tile size + gaps + card padding), in
// rem. Any sibling content meant to visually align under/beside the grid
// (e.g. the blocked-item queue) should cap itself to this same width —
// otherwise, with enough content to need it, that sibling grows wider than
// the grid and destabilizes the whole page layout (its column becomes the
// widest thing in its row, which can force later columns to wrap).
export function gridWidthRem(cols) {
  return cols * 4.25 + Math.max(cols - 1, 0) * 0.5 + 2
}

export function cloneBoard(board, name) {
  return {
    ...board,
    id: crypto.randomUUID(),
    name: name ?? `${board.name} copy`,
    tiles: board.tiles.map((row) => [...row]),
    semiPlacements: board.semiPlacements.map((p) => ({ ...p })),
    blockedQueue: [...board.blockedQueue],
  }
}

