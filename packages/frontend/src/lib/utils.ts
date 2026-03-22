import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const ROUNDS_INFO = [
  { roundNumber: 1, cardsDealt: 7, description: 'Two trios' },
  { roundNumber: 2, cardsDealt: 8, description: 'One trio + one run' },
  { roundNumber: 3, cardsDealt: 9, description: 'Two runs' },
  { roundNumber: 4, cardsDealt: 10, description: 'Three trios' },
  { roundNumber: 5, cardsDealt: 11, description: 'Two trios + one run' },
  { roundNumber: 6, cardsDealt: 12, description: 'One trio + two runs' },
  { roundNumber: 7, cardsDealt: 13, description: 'Three runs' },
] as const

export const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

export const AVATAR_EMOJIS: Record<string, string> = {
  cat: '🐱', fox: '🦊', bear: '🐻', rabbit: '🐰', wolf: '🐺',
  owl: '🦉', lion: '🦁', tiger: '🐯', penguin: '🐧', dolphin: '🐬',
  elephant: '🐘', giraffe: '🦒', koala: '🐨', panda: '🐼', zebra: '🦓',
}

export const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }
