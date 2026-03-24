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
  role: 'admin' | 'user'
  // user fields:
  userId?: string
  email?: string
  emailVerified?: boolean
  playerId?: string
  playerName?: string
  playerAvatar?: string
  groupId?: string
  groupName?: string
  groupSlug?: string
  groupRole?: 'owner' | 'admin' | 'member'
  currency?: 'GBP' | 'EUR' | 'USD'
  // admin fields:
  adminId?: string
  username?: string
  // multi-group selection:
  requiresGroupSelection?: boolean
  groups?: Array<{ groupId: string; groupName: string; groupSlug: string; groupRole: string }>
}

export interface Player {
  id: string
  name: string
  avatar: string
  email?: string | null
  active: boolean
  createdAt: string
  role?: 'OWNER' | 'ADMIN' | 'MEMBER'
  userId?: string | null
  inviteToken?: string | null
}

export interface GroupSettings {
  id: string
  name: string
  slug: string
  currency: 'GBP' | 'EUR' | 'USD'
}

export interface InvitationPreview {
  playerName: string
  groupName: string
}

export interface Season {
  id: string
  groupId: string
  name: string
  status: 'ACTIVE' | 'CLOSED'
  createdAt: string
  closedAt?: string | null
  _count?: { games: number; players: number }
  potEnabled: boolean
  contributionAmount?: string | null
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
  totalPot?: string | null
}

export interface GamePlayer {
  id: string
  gameId: string
  playerId: string
  player: Pick<Player, 'id' | 'name' | 'avatar'>
  potAwarded?: string | null
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
  totalEarnings: number
}

export interface BracketStagePreview {
  stageNumber: number
  tableCount: number
  playersPerTable: number
  advancePerTable: number
}

export interface BracketPreview {
  stages: BracketStagePreview[]
}

export interface TournamentSummary {
  id: string
  name: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  playerCount: number
  createdAt: string
}

export interface TournamentTablePlayer {
  id: string
  tableId: string
  playerId: string | null
  player: Player | null
  isBye: boolean
  advanced: boolean
  score?: number
}

export interface TournamentTable {
  id: string
  stageId: string
  tableNumber: number
  gameId: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  players: TournamentTablePlayer[]
}

export interface TournamentStage {
  id: string
  tournamentId: string
  stageNumber: number
  startRound: number
  endRound: number
  advancePerTable: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  tables: TournamentTable[]
}

export interface Tournament {
  id: string
  groupId: string
  name: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  createdAt: string
  participants: { id: string; playerId: string; player: Player }[]
  stages: TournamentStage[]
}

export interface Group {
  id: string
  name: string
  slug: string
  createdAt: string
  currency: 'GBP' | 'EUR' | 'USD'
  _count?: { players: number }
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

export const getTournamentPreview = (playerCount: number) =>
  api.get<BracketPreview>(`/tournaments/preview?playerCount=${playerCount}`)

export const listTournaments = () =>
  api.get<TournamentSummary[]>('/tournaments')

export const getTournament = (id: string) =>
  api.get<Tournament>(`/tournaments/${id}`)

export const createTournament = (body: {
  name: string
  playerIds: string[]
  stageConfigs: { startRound: number; endRound: number }[]
}) => api.post<Tournament>('/tournaments', body)

export const advanceTournamentStage = (tournamentId: string, stageId: string) =>
  api.post<Tournament>(`/tournaments/${tournamentId}/stages/${stageId}/advance`, {})
