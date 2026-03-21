# Share Game Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On any closed game's history page, let users share the final result as a formatted text message via the Web Share API (mobile) or copy to clipboard (desktop).

**Architecture:** Pure frontend. The game response from `GET /api/games/:id` already includes `game.season.name`. Add `season` to the `Game` type, fetch season games to derive game index, add `buildShareText` utility and share button to `GameHistory.tsx`.

**Tech Stack:** React, Web Share API, Clipboard API, TanStack Query

---

## File Map

- Modify: `packages/frontend/src/lib/api.ts` — add `season` field to `Game` type
- Modify: `packages/frontend/src/pages/GameHistory.tsx` — share button + logic
- Modify: `packages/frontend/src/pages/GameHistory.test.tsx` (or create test file) — unit tests for `buildShareText`

---

### Task 1: Add `season` field to `Game` type in `api.ts`

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`

The backend `GET /api/games/:id` already includes `season: { id, name, groupId }` in its response. The frontend `Game` type just doesn't expose it.

- [ ] **Step 1: Update the `Game` interface**

Add `season` field:
```typescript
export interface Game {
  id: string
  seasonId: string
  season?: { id: string; name: string }   // ← add this line
  status: 'IN_PROGRESS' | 'CLOSED'
  createdAt: string
  closedAt?: string | null
  players: GamePlayer[]
  rounds?: Round[]
  totals?: Record<string, number>
  _count?: { rounds: number }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/api.ts
git commit -m "feat: add season field to Game type"
```

---

### Task 2: Write `buildShareText` and add share logic to `GameHistory.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/GameHistory.tsx`

- [ ] **Step 1: Read `packages/frontend/src/pages/GameHistory.tsx`**

The file fetches `GET /api/games/:id` and shows the final results. It already has `game.totals`, `game.players`, `game.rounds`.

- [ ] **Step 2: Add imports**

Add to imports:
```typescript
import { useQuery } from '@tanstack/react-query'
import { api, Game as GameType } from '@/lib/api'
import { toast } from '@/hooks/useToast'
```

(Note: `useQuery` is already imported. Just ensure `toast` is added.)

- [ ] **Step 3: Add season games query to derive game index**

Inside `GameHistory`, after the existing `game` query:
```typescript
const { data: seasonGames } = useQuery<GameType[]>({
  queryKey: ['games', game?.seasonId],
  queryFn: () => api.get<GameType[]>(`/seasons/${game!.seasonId}/games`),
  enabled: !!game,
})
```

- [ ] **Step 4: Add `buildShareText` function**

Add this function outside the component (at module scope, before `export default function GameHistory`):
```typescript
export function buildShareText(
  game: GameType,
  totals: Record<string, number>,
  gameIndex: number,
): string {
  const ranked = [...game.players]
    .map(gp => ({ ...gp, total: totals[gp.playerId] ?? 0 }))
    .sort((a, b) => a.total - b.total)

  const wentOutPlayers = new Set(
    (game.rounds ?? []).flatMap(r =>
      r.scores.filter(s => s.wentOut).map(s => s.playerId)
    )
  )

  const lines = ranked.map((p, i) => {
    const prefix = i === 0 ? '🏆' : `${i + 1}.`
    const suffix = wentOutPlayers.has(p.playerId) ? ' ⚡' : ''
    return `${prefix} ${p.player.name} · ${p.total} pts${suffix}`
  })

  const seasonName = game.season?.name ?? 'Season'

  return [
    `🃏 Continental — ${seasonName}, Game #${gameIndex}`,
    '',
    ...lines,
    '',
    `Played ${game.rounds?.length ?? 0} rounds · via Continental app`,
  ].join('\n')
}
```

- [ ] **Step 5: Add `handleShare` function inside the component**

Inside `GameHistory` (after the data fetching, before the return):
```typescript
const gameIndex = seasonGames
  ? [...seasonGames]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .findIndex(g => g.id === id) + 1
  : 0

async function handleShare() {
  if (!game) return
  const text = buildShareText(game, totals, gameIndex)

  if (navigator.share) {
    try {
      await navigator.share({ text })
    } catch {
      // User cancelled — do nothing
    }
  } else {
    await navigator.clipboard.writeText(text)
    toast({ title: 'Result copied to clipboard!' })
  }
}
```

- [ ] **Step 6: Add Share button to the page header**

In the JSX header section (the `<div>` that contains the "Final Results" heading), add the Share button alongside:
```tsx
<div className="flex items-start justify-between">
  <div>
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Final Results</p>
    <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">Game Over</h1>
    <p className="text-sm text-muted-foreground mt-1">
      {new Date(game.createdAt).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
    </p>
  </div>
  <Button variant="outline" size="sm" onClick={handleShare}>
    Share result
  </Button>
</div>
```

Replace the existing header `<div>` with this version (it adds the outer flex wrapper and the Share button).

Also add the Button import if not present:
```typescript
import { Button } from '@/components/ui/button'
```

- [ ] **Step 7: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds, no TypeScript errors

---

### Task 3: Write unit tests for `buildShareText`

**Files:**
- Create: `packages/frontend/src/pages/__tests__/GameHistory.test.ts` (or `buildShareText.test.ts` — check existing test file structure)

First check where frontend tests live:
Run: `find packages/frontend/src -name "*.test.*" | head -5`

- [ ] **Step 1: Create test file**

Create `packages/frontend/src/pages/__tests__/buildShareText.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildShareText } from '../GameHistory'

const makeGame = (
  players: Array<{ id: string; name: string }>,
  roundScores: Array<Record<string, { points: number; wentOut: boolean }>>,
  seasonName = 'Summer 2026',
) => ({
  id: 'g1',
  seasonId: 's1',
  season: { id: 's1', name: seasonName },
  status: 'CLOSED' as const,
  createdAt: '2026-03-21T00:00:00Z',
  players: players.map(p => ({
    id: `gp-${p.id}`, gameId: 'g1', playerId: p.id,
    player: { id: p.id, name: p.name, avatar: 'cat' },
  })),
  rounds: [
    {
      id: 'r1', gameId: 'g1', roundNumber: 1,
      scores: players.map(p => ({
        id: `s-${p.id}`, roundId: 'r1', playerId: p.id,
        points: roundScores[0][p.id]?.points ?? 0,
        wentOut: roundScores[0][p.id]?.wentOut ?? false,
        player: { id: p.id, name: p.name, avatar: 'cat' },
      })),
    },
  ],
})

describe('buildShareText', () => {
  it('ranks players by ascending total score', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 50, wentOut: false }, p2: { points: 20, wentOut: false } }],
    )
    const totals = { p1: 50, p2: 20 }
    const text = buildShareText(game, totals, 4)

    const lines = text.split('\n')
    expect(lines[2]).toContain('🏆')
    expect(lines[2]).toContain('Bob')   // lower score wins
    expect(lines[3]).toContain('2.')
    expect(lines[3]).toContain('Alice')
  })

  it('marks winner with 🏆 prefix', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 10, wentOut: false }, p2: { points: 80, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 10, p2: 80 }, 1)
    expect(text).toContain('🏆 Alice')
  })

  it('adds ⚡ for players who went out', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 0, wentOut: true }, p2: { points: 40, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 0, p2: 40 }, 2)
    expect(text).toContain('Alice · 0 pts ⚡')
    expect(text).not.toContain('Bob · 40 pts ⚡')
  })

  it('includes season name and game index in header', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }],
      [{ p1: { points: 10, wentOut: false } }],
      'Winter 2025',
    )
    const text = buildShareText(game, { p1: 10 }, 7)
    expect(text).toContain('Winter 2025, Game #7')
  })

  it('includes round count in footer', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }],
      [{ p1: { points: 10, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 10 }, 1)
    expect(text).toContain('Played 1 rounds · via Continental app')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npm test -w packages/frontend`
Expected: All tests pass (27 existing + 5 new = 32 total)

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/GameHistory.tsx \
        packages/frontend/src/pages/__tests__/buildShareText.test.ts \
        packages/frontend/src/lib/api.ts
git commit -m "feat: add Share Game Result button to game history page"
```

---

### Task 4: Deploy and validate

- [ ] **Step 1: Deploy frontend only (no backend changes)**

```bash
npm run build -w packages/frontend
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

- [ ] **Step 2: Validate at https://d2f12kp396t6lu.cloudfront.net**

1. Navigate to a closed game's history page (`/games/:id/history`)
2. "Share result" button is visible in the header
3. On mobile (iOS/Android): tapping opens the native share sheet with formatted text
4. On desktop: tapping copies text and shows "Result copied to clipboard!" toast
5. Verify the share text format:
   ```
   🃏 Continental — [Season Name], Game #N

   🏆 [Winner] · [score] pts
   2. [Player2] · [score] pts
   ...

   Played N rounds · via Continental app
   ```
6. Winner has 🏆 prefix, players who went out have ⚡ suffix
7. Game #N shows the correct index (1st game in season = #1, etc.)

