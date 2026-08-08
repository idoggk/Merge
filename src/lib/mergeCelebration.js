export const EMOJI_POOL = ['✨', '🎉', '⭐', '💥', '🌟', '💫']

// Three tiers, scaling with how big the merge's resulting rank is - a small
// merge gets a single flying emoji, a big one gets a full confetti burst.
export const TIERS = {
  small: { count: 1, spread: 34, duration: 650, sizeClass: 'text-lg' },
  medium: { count: 8, spread: 64, duration: 850, sizeClass: 'text-xl' },
  big: { count: 20, spread: 100, duration: 1100, sizeClass: 'text-2xl' },
}

export function tierForRank(rank) {
  if (rank >= 8) return 'big'
  if (rank >= 5) return 'medium'
  return 'small'
}

export function celebrationDuration(tier) {
  return TIERS[tier].duration
}

export function makeParticles(tier) {
  const { count, spread } = TIERS[tier]
  return Array.from({ length: count }, (_, i) => {
    // Evenly spaced base angle plus jitter, so particles fan out instead of
    // clumping, with a slight upward bias (merge games "pop" up, not down).
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
    const distance = spread * (0.55 + Math.random() * 0.45)
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance - spread * 0.25
    const rot = (Math.random() - 0.5) * 360
    const emoji = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]
    const delay = Math.random() * 60
    return { key: i, dx, dy, rot, emoji, delay }
  })
}
