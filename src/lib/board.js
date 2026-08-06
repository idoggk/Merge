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
    // Generated item layout, persisted so it survives reload and so the
    // upcoming playthrough simulation has a fixed, reproducible board to run
    // against. semiPlacements are grid-fixed ({row, col, rank}); blockedQueue
    // is position-independent — which physical tile each entry lands on is
    // decided at simulation time, only the reveal order is controlled here.
    semiPlacements: [],
    blockedQueue: [],
  }
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

