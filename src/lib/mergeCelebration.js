export const EMOJI_POOL = ['✨', '🎉', '⭐', '💥', '🌟', '💫']

// Three tiers, scaling with how big the merge's resulting rank is - a small
// merge gets a single flying emoji, a big one gets a full confetti burst.
export const TIERS = {
  small: { count: 2, spread: 55, duration: 750, sizeClass: 'text-2xl' },
  medium: { count: 12, spread: 100, duration: 950, sizeClass: 'text-3xl' },
  big: { count: 26, spread: 150, duration: 1300, sizeClass: 'text-4xl' },
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
