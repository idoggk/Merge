// Packs a board list into a URL-safe string so a designed stage can be
// shared as a link (?play&stage=...) rather than relying on localStorage,
// which is per-browser and wouldn't reach anyone else's device. Kept to
// plain base64 JSON (no compression) - simple, and stages are small (a
// handful of boards, a few dozen numbers each); if this ever needs to
// support much larger stages, revisit with real compression rather than
// shortening field names, which would just trade one size problem for a
// forward-compatibility one.
export function encodeStage(boards) {
  const json = JSON.stringify(boards)
  const base64 = btoa(unescape(encodeURIComponent(json)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Returns null on anything malformed (bad base64, invalid JSON, not an
// array) rather than throwing - callers should treat null as "fall back to
// the default stage."
export function decodeStage(encoded) {
  if (!encoded) return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(base64)))
    const boards = JSON.parse(json)
    return Array.isArray(boards) && boards.length ? boards : null
  } catch {
    return null
  }
}
