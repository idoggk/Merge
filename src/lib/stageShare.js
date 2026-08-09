import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'

// Packs a board list into a URL-safe string so a designed stage can be
// shared as a link (?play&stage=...) rather than relying on localStorage,
// which is per-browser and wouldn't reach anyone else's device.
//
// Gzipped via fflate (a pure-JS implementation, not the browser's native
// CompressionStream) before base64-encoding - found live, the hard way: the
// previous plain-base64-JSON version worked for a tiny demo stage but a
// realistic multi-board design produced a URL long enough (~8-8.5KB, right
// around 9-10 boards of modest size) to get rejected by GitHub Pages' own
// Fastly CDN with a flat HTTP 414 "URI Too Long" - a server-side rejection
// that happens before this app's JS (or decodeStage) ever runs, so no
// client-side error handling could have caught it. Board JSON is highly
// repetitive (the same tile-state strings and field names over and over),
// so gzip buys real headroom - roughly 5-8x in testing - before the same
// ceiling gets hit again on much bigger stages. fflate over the native
// CompressionStream specifically because CompressionStream/DecompressionStream
// only reached Safari in 16.4 (Mar 2023) - this feature is meant to be
// played on a phone (see CLAUDE.md's "Phone/landscape support"), so an
// older-iOS recipient failing to decompress a link the sender's modern
// desktop browser compressed fine would just be a different, sneakier
// version of the same bug. fflate's sync API works identically everywhere,
// at the cost of a small bundled dependency.
//
// Compression alone doesn't remove the ceiling, just raises it - MAX_SAFE_STAGE_CHARS
// is a conservative warning threshold (see App.jsx's handleShare) for when
// a stage is large enough that its *compressed* link might still be at risk,
// on this CDN or a stricter corporate proxy with a similar class of limit.
export const MAX_SAFE_STAGE_CHARS = 6000

export function encodeStage(boards) {
  const json = JSON.stringify(boards)
  const compressed = gzipSync(strToU8(json))
  return bytesToBase64Url(compressed)
}

// Returns null on anything malformed (bad base64, corrupted gzip, invalid
// JSON, not an array) rather than throwing - callers should treat null as
// "this link is broken," not silently identical to "no stage was shared."
export function decodeStage(encoded) {
  if (!encoded) return null
  try {
    const bytes = base64UrlToBytes(encoded)
    const json = strFromU8(gunzipSync(bytes))
    const boards = JSON.parse(json)
    return Array.isArray(boards) && boards.length ? boards : null
  } catch {
    return null
  }
}

// Chunked to avoid blowing the call stack on String.fromCharCode's argument
// spread for a large compressed payload (fine at the sizes a compressed
// stage produces, but the chunking has no downside either way).
function bytesToBase64Url(bytes) {
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(encoded) {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
