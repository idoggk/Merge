// Multi-source BFS, 4-directional, seeded from every "open" tile.
// Returns a rows x cols grid of distances (Infinity where unreachable, e.g.
// a board with no open tiles at all).
export function computeDistances(tiles) {
  const rows = tiles.length
  const cols = tiles[0]?.length ?? 0
  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity))
  const queue = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === 'open') {
        dist[r][c] = 0
        queue.push([r, c])
      }
    }
  }

  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]

  let head = 0
  while (head < queue.length) {
    const [r, c] = queue[head++]
    for (const [dr, dc] of deltas) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      if (dist[nr][nc] !== Infinity) continue
      dist[nr][nc] = dist[r][c] + 1
      queue.push([nr, nc])
    }
  }

  return dist
}
