import { describe, it, expect } from 'vitest'
import { ROUNDS_INFO, AVATAR_EMOJIS } from '../utils'

describe('ROUNDS_INFO', () => {
  it('has exactly 7 entries', () => {
    expect(ROUNDS_INFO).toHaveLength(7)
  })

  it('round 1 deals 7 cards', () => {
    expect(ROUNDS_INFO[0].cardsDealt).toBe(7)
  })

  it('round 7 deals 13 cards', () => {
    expect(ROUNDS_INFO[6].cardsDealt).toBe(13)
  })

  it('roundNumbers are 1 through 7 in order', () => {
    ROUNDS_INFO.forEach((r, i) => {
      expect(r.roundNumber).toBe(i + 1)
    })
  })
})

describe('AVATAR_EMOJIS', () => {
  it('returns an emoji string for known keys', () => {
    expect(typeof AVATAR_EMOJIS['cat']).toBe('string')
    expect(AVATAR_EMOJIS['cat'].length).toBeGreaterThan(0)
  })

  it('returns an emoji for all 15 avatar options', () => {
    const keys = [
      'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
      'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
    ]
    for (const key of keys) {
      expect(AVATAR_EMOJIS[key]).toBeTruthy()
    }
  })
})
