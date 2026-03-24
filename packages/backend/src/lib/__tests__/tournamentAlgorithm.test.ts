import { describe, it, expect } from 'vitest'
import { computeBracket, type StageDescriptor } from '../tournamentAlgorithm.js'

describe('computeBracket', () => {
  it('returns single final stage for 3 players (minimum)', () => {
    const stages = computeBracket(3)
    expect(stages).toHaveLength(1)
    expect(stages[0]).toMatchObject({ tableCount: 1, playersPerTable: 3, advancePerTable: 0 })
  })

  it('returns single final stage for 6 players (max single table)', () => {
    const stages = computeBracket(6)
    expect(stages).toHaveLength(1)
    expect(stages[0]).toMatchObject({ tableCount: 1, playersPerTable: 6, advancePerTable: 0 })
  })

  it('12 players → 2 stages (3 tables of 4, then final of 6)', () => {
    const stages = computeBracket(12)
    expect(stages).toHaveLength(2)
    expect(stages[0]).toMatchObject({ tableCount: 3, playersPerTable: 4, advancePerTable: 2 })
    expect(stages[1]).toMatchObject({ tableCount: 1, advancePerTable: 0 })
    // Final has 6 players (3 tables × 2)
    expect(stages[1].playersPerTable).toBe(6)
  })

  it('7 players → 2 stages (2 tables, then final of 4 or 6)', () => {
    const stages = computeBracket(7)
    expect(stages).toHaveLength(2)
    expect(stages[0].tableCount).toBeGreaterThanOrEqual(2)
    expect(stages[0].advancePerTable).toBeGreaterThan(0)
    expect(stages[1].tableCount).toBe(1)
    expect(stages[1].advancePerTable).toBe(0)
    expect(stages[1].stageNumber).toBe(2)
  })

  it('stageNumbers are sequential starting from 1', () => {
    for (const n of [3, 6, 7, 12, 20]) {
      const stages = computeBracket(n)
      stages.forEach((s, i) => {
        expect(s.stageNumber, `n=${n}, stage index ${i}`).toBe(i + 1)
      })
    }
  })

  it('20 players → produces valid multi-stage bracket ending in single table', () => {
    const stages = computeBracket(20)
    // Just verify the final stage is a single table within [3,6]
    const final = stages[stages.length - 1]
    expect(final.tableCount).toBe(1)
    expect(final.playersPerTable).toBeGreaterThanOrEqual(3)
    expect(final.playersPerTable).toBeLessThanOrEqual(6)
    expect(final.advancePerTable).toBe(0)
  })

  it('all intermediate stages have tables of 3–6 players', () => {
    for (let n = 7; n <= 32; n++) {
      const stages = computeBracket(n)
      for (const s of stages) {
        expect(s.playersPerTable, `n=${n}`).toBeGreaterThanOrEqual(3)
        expect(s.playersPerTable, `n=${n}`).toBeLessThanOrEqual(6)
      }
    }
  })

  it('byeCount is 0 for exact fits (12 players)', () => {
    const stages = computeBracket(12)
    expect(stages[0].byeCount).toBe(0)
  })

  it('byeCount > 0 when padding required (13 players)', () => {
    const stages = computeBracket(13)
    expect(stages[0].byeCount).toBeGreaterThan(0)
  })

  it('throws for player count below 3', () => {
    expect(() => computeBracket(2)).toThrow()
  })
})
