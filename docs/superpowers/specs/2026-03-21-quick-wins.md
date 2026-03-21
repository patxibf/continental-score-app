# Quick Wins Batch

**Goal:** Ship six small improvements: Quick Rematch, Undo Last Round, Season Progress Bar, Activity Feed, Player Avatars (emoji), and Haptic Feedback.

**Architecture:** Mostly frontend. One new backend endpoint (`DELETE /api/rounds/:id`). No new DB columns. No new pages — all changes are additions to existing pages/components.

**Tech Stack:** React, TanStack Query, Fastify, Prisma, Zod

---

## Feature 1: Quick Rematch

**Where:** `packages/frontend/src/pages/Game.tsx`

When a game's status is `CLOSED`, show a "Rematch" button that creates a new game with the same players in the same season.

**Frontend change:**
```tsx
// In Game.tsx, in the closed-game view
const rematchMutation = useMutation({
  mutationFn: () =>
    api.post<Game>(`/seasons/${game.seasonId}/games`, {
      playerIds: game.players.map(gp => gp.playerId),
    }),
  onSuccess: (newGame) => navigate(`/games/${newGame.id}`),
  onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
})

// Show only when game is CLOSED and isGroupAdmin
{game.status === 'CLOSED' && isGroupAdmin && (
  <Button onClick={() => rematchMutation.mutate()} disabled={rematchMutation.isPending}>
    {rematchMutation.isPending ? 'Starting…' : 'Rematch'}
  </Button>
)}
```

**No backend changes.** Uses existing `POST /api/seasons/:seasonId/games`.

---

## Feature 2: Undo Last Round

**Where:**
- Create: `packages/backend/src/routes/rounds.ts`
- Test: `packages/backend/src/routes/__tests__/rounds.test.ts`
- Update: `packages/frontend/src/pages/Game.tsx`

Delete the most recently submitted round of an IN_PROGRESS game.

**Backend — new endpoint:**
```typescript
fastify.delete(
  '/api/rounds/:id',
  { preHandler: [fastify.requireGroup] },
  async (request, reply) => {
    const { groupId } = request.user as { groupId: string; groupAccess: string }
    const { id } = request.params as { id: string }

    const round = await prisma.round.findFirst({
      where: { id, game: { season: { groupId } } },
      include: { game: { include: { rounds: { orderBy: { roundNumber: 'desc' }, take: 1 } } } },
    })

    if (!round) return reply.status(404).send({ error: 'Round not found' })
    if (round.game.status === 'CLOSED') return reply.status(403).send({ error: 'Game is closed' })
    // Only allow deleting the last round
    if (round.game.rounds[0].id !== id) {
      return reply.status(400).send({ error: 'Can only undo the last round' })
    }

    await prisma.round.delete({ where: { id } })
    return reply.status(204).send()
  },
)
```

**Backend test:**
```typescript
describe('DELETE /api/rounds/:id', () => {
  it('deletes the last round of an IN_PROGRESS game', async () => { ... })
  it('returns 400 when trying to delete a non-last round', async () => { ... })
  it('returns 403 when game is CLOSED', async () => { ... })
})
```

**Frontend:** In `Game.tsx`, show "Undo last round" button when game is IN_PROGRESS and there is at least one round. Requires confirmation dialog.

```tsx
const undoMutation = useMutation({
  mutationFn: () => api.delete(`/rounds/${lastRound.id}`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game', id] }),
  onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
})
```

Show only when `isGroupAdmin && game.status === 'IN_PROGRESS' && game.rounds.length > 0`.

---

## Feature 3: Season Progress Bar

**Where:** `packages/frontend/src/pages/Dashboard.tsx` (or wherever the main dashboard renders)

Show a compact card on the dashboard with: season name, game count, and top 3 standings.

**Frontend change:** Query `/api/seasons` to get the active season, then `/api/seasons/:id/standings` (or standings from season detail). Display:
- Season name + status chip
- "N games played" count
- Top 3 players with scores

Uses data already available from existing API endpoints.

---

## Feature 4: Activity Feed

**Where:** `packages/frontend/src/pages/Dashboard.tsx`

Show the 5 most recently closed games in the active season as an activity list.

**Frontend change:** Query `GET /api/seasons/:id/games` (already exists), filter to `status === 'CLOSED'`, take the 5 most recent, render as:

```
🏆 Andrés won Game #4  ·  2 days ago
   Andrés 224 · María 287 · Carlos 312
```

Winner = player with lowest total score. Uses data already returned by the games endpoint (which includes player scores via rounds).

---

## Feature 5: Player Avatars (Emoji)

**Where:**
- `packages/frontend/src/pages/Players.tsx` — add emoji picker to edit form
- `packages/frontend/src/pages/Game.tsx` — show avatar circle next to player name in scoreboard
- `packages/frontend/src/pages/SeasonDetail.tsx` — show avatar in standings table

The `avatar` field already exists on the `Player` model and is already returned by the API. The Players edit form just doesn't expose it yet.

**Frontend — emoji picker in Players.tsx:**
```tsx
// Simple inline emoji grid, no library needed
const AVATAR_EMOJIS = ['🎴','🃏','♠️','♥️','♦️','♣️','🎯','🏆','⚡','🔥','❄️','👑','🦁','🐯','🦊','🐺','🎭','🤠','😎','🧠']

// In player edit form:
<div className="grid grid-cols-10 gap-1">
  {AVATAR_EMOJIS.map(emoji => (
    <button
      key={emoji}
      type="button"
      onClick={() => setAvatar(emoji)}
      className={`text-lg p-1 rounded ${avatar === emoji ? 'ring-2 ring-cobalt' : ''}`}
    >
      {emoji}
    </button>
  ))}
</div>
```

**Show avatar in scoreboards:** Wherever player name is displayed in Game.tsx / SeasonDetail.tsx, prepend the avatar emoji if set:
```tsx
<span>{player.avatar || '🎴'} {player.name}</span>
```

No backend changes needed — avatar is already stored and returned.

---

## Feature 6: Haptic Feedback

**Where:** `packages/frontend/src/lib/haptics.ts` (new tiny utility)

```typescript
export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!navigator.vibrate) return
  const durations = { light: 10, medium: 25, heavy: 50 }
  navigator.vibrate(durations[style])
}
```

Call `haptic('medium')` in:
- Round submit success callback in `Game.tsx`
- Game close success callback in `Game.tsx`
- Rematch button tap in `Game.tsx`

---

## Testing

```bash
npm test -w packages/backend   # new DELETE /api/rounds/:id tests pass
npm test -w packages/frontend  # 27 tests pass
npm run build -w packages/frontend
```

---

## Deployment

**Backend** (new endpoint):
```bash
npm run build -w packages/backend
tar czf /tmp/backend-dist.tar.gz packages/backend/dist packages/backend/prisma
aws s3 cp /tmp/backend-dist.tar.gz s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz
# Generate presigned URL, SSM deploy command (migrate → generate → chown → pm2 restart)
```

**Frontend:**
```bash
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

---

## Validation

Via API + browser:
1. On a closed game: "Rematch" button appears, clicking it creates a new IN_PROGRESS game and navigates to it
2. During a game with rounds: "Undo last round" appears, confirm deletes the round
3. Dashboard shows active season progress card and activity feed
4. Player edit form shows emoji picker; selected emoji appears on scoreboard
5. On mobile: submit a round and feel vibration
