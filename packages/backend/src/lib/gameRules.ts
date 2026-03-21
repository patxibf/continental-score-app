export const ROUNDS = [
  { roundNumber: 1, cardsDealt: 7, description: 'Two trios' },
  { roundNumber: 2, cardsDealt: 8, description: 'One trio + one run' },
  { roundNumber: 3, cardsDealt: 9, description: 'Two runs' },
  { roundNumber: 4, cardsDealt: 10, description: 'Three trios' },
  { roundNumber: 5, cardsDealt: 11, description: 'Two trios + one run' },
  { roundNumber: 6, cardsDealt: 12, description: 'One trio + two runs' },
  { roundNumber: 7, cardsDealt: 13, description: 'Three runs' },
] as const

export const TOTAL_ROUNDS = 7

export const CARD_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 10, Q: 10, K: 10, A: 20, Joker: 50,
}

export function getRoundInfo(roundNumber: number) {
  return ROUNDS.find(r => r.roundNumber === roundNumber)
}
