import { describe, it, expect } from 'vitest'
import { ROUNDS, getRoundInfo, TOTAL_ROUNDS } from '../gameRules.js'

describe('gameRules', () => {
  describe('ROUNDS', () => {
    it('has exactly 7 rounds', () => {
      expect(ROUNDS).toHaveLength(7)
    })

    it('round 1 deals 7 cards and is Two trios', () => {
      expect(ROUNDS[0]).toMatchObject({ roundNumber: 1, cardsDealt: 7, description: 'Two trios' })
    })

    it('round 7 deals 13 cards and is Three runs', () => {
      expect(ROUNDS[6]).toMatchObject({ roundNumber: 7, cardsDealt: 13, description: 'Three runs' })
    })
  })

  describe('TOTAL_ROUNDS', () => {
    it('is 7', () => {
      expect(TOTAL_ROUNDS).toBe(7)
    })
  })

  describe('getRoundInfo', () => {
    it('returns the correct info for each round 1–7', () => {
      for (let n = 1; n <= 7; n++) {
        const info = getRoundInfo(n)
        expect(info).toBeDefined()
        expect(info!.roundNumber).toBe(n)
      }
    })

    it('returns undefined for round 0', () => {
      expect(getRoundInfo(0)).toBeUndefined()
    })

    it('returns undefined for round 8', () => {
      expect(getRoundInfo(8)).toBeUndefined()
    })
  })
})
