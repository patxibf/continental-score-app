export interface StageDescriptor {
  stageNumber: number
  tableCount: number
  playersPerTable: number
  advancePerTable: number // 0 for the final stage
  byeCount: number        // phantom players added to reach a valid count
}

// Preferred table sizes in priority order
const PREFERRED_SIZES = [4, 5, 3, 6]

/**
 * Given a pool size, find a valid split into tables of 3–6.
 * Returns { tableCount, playersPerTable } or null if impossible without padding.
 */
function findSplit(players: number): { tableCount: number; playersPerTable: number } | null {
  for (const size of PREFERRED_SIZES) {
    if (players % size === 0) {
      return { tableCount: players / size, playersPerTable: size }
    }
  }
  return null
}

/**
 * Round `players` up to the nearest count that has a valid split.
 * Returns { padded, byeCount }.
 */
function padToValid(players: number): { padded: number; byeCount: number } {
  for (let extra = 1; extra <= 10; extra++) {
    if (findSplit(players + extra)) {
      return { padded: players + extra, byeCount: extra }
    }
  }
  // Should never reach here for any reasonable input
  throw new Error(`Cannot find valid bracket for ${players} players`)
}

/**
 * Compute the bracket structure for a given player count.
 * Returns an ordered array of stage descriptors from Round 1 to Final.
 * The final stage has advancePerTable = 0.
 */
export function computeBracket(playerCount: number): StageDescriptor[] {
  if (playerCount < 3) throw new Error('Tournament requires at least 3 players')

  // If it already fits in one table → immediate final
  if (playerCount <= 6) {
    return [{ stageNumber: 1, tableCount: 1, playersPerTable: playerCount, advancePerTable: 0, byeCount: 0 }]
  }

  const stages: StageDescriptor[] = []
  let current = playerCount
  let stageNumber = 1

  while (current > 6) {
    let byeCount = 0
    let split = findSplit(current)

    if (!split) {
      const padded = padToValid(current)
      byeCount = padded.byeCount
      current = padded.padded
      split = findSplit(current)!
    }

    // Choose advancePerTable: largest value such that tableCount × advance is a valid next-stage input
    // Try 2 first (most common), then 3, then 1
    let advance = 0
    for (const candidate of [2, 3, 1]) {
      const nextPool = split.tableCount * candidate
      if (nextPool <= 6 || findSplit(nextPool) || padToValid(nextPool).byeCount <= 3) {
        advance = candidate
        break
      }
    }
    if (advance === 0) advance = 2 // fallback

    stages.push({
      stageNumber,
      tableCount: split.tableCount,
      playersPerTable: split.playersPerTable,
      advancePerTable: advance,
      byeCount,
    })

    current = split.tableCount * advance
    stageNumber++
  }

  // Final stage
  stages.push({
    stageNumber,
    tableCount: 1,
    playersPerTable: current,
    advancePerTable: 0,
    byeCount: 0,
  })

  return stages
}
