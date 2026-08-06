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
  }
}

export function cloneBoard(board, name) {
  return {
    ...board,
    id: crypto.randomUUID(),
    name: name ?? `${board.name} copy`,
    tiles: board.tiles.map((row) => [...row]),
  }
}

