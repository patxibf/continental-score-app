const API_BASE = '/api'

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    const fieldErrors = error.details?.fieldErrors
    if (fieldErrors) {
      const messages = Object.values(fieldErrors as Record<string, string[]>).flat().join(', ')
      if (messages) throw new Error(messages)
    }
    throw new Error(error.error || 'Request failed')
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// Types
export interface AuthUser {
  role: 'admin' | 'group'
  groupAccess?: 'admin' | 'member'
  groupId?: string
  groupName?: string
  username?: string
}

export interface Player {
  id: string
  name: string
  avatar: string
  email?: string | null
  phone?: string | null
  active: boolean
  createdAt: string
}

export interface Season {
  id: string
  groupId: string
  name: string
  status: 'ACTIVE' | 'CLOSED'
  createdAt: string
  closedAt?: string | null
  _count?: { games: number; players: number }
}

export interface Game {
  id: string
  seasonId: string
  season?: { id: string; name: string }
  status: 'IN_PROGRESS' | 'CLOSED'
  createdAt: string
  closedAt?: string | null
  players: GamePlayer[]
  rounds?: Round[]
  totals?: Record<string, number>
  _count?: { rounds: number }
}

export interface GamePlayer {
  id: string
  gameId: string
  playerId: string
  player: Pick<Player, 'id' | 'name' | 'avatar'>
}

export interface Round {
  id: string
  gameId: string
  roundNumber: number
  completedAt?: string | null
  scores: RoundScore[]
}

export interface RoundScore {
  id: string
  roundId: string
  playerId: string
  points: number
  wentOut: boolean
  player: Pick<Player, 'id' | 'name' | 'avatar'>
}

export interface Standing {
  playerId: string
  playerName: string
  playerAvatar: string
  totalPoints: number
  gamesPlayed: number
  wins: number
  avgPoints?: number
  winRate?: number
  bestGame?: number | null
  worstGame?: number | null
}

export interface Group {
  id: string
  name: string
  username: string
  createdAt: string
  hasMemberPassword?: boolean
}

export interface AllTimePlayer {
  playerId: string
  name: string
  avatar: string | null
  gamesPlayed: number
  wins: number
  totalScore: number
  currentStreak: number
  streakType: 'win' | 'loss' | null
  badges: string[]
}

export interface H2HResult {
  gamesPlayed: number
  winsA: number
  winsB: number
  ties: number
}
