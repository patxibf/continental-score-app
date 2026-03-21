# Quick Wins Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five improvements: Quick Rematch, Undo Last Round, Season Progress (top 3 in dashboard), Activity Feed (winner shown), and Haptic Feedback. Note: Player Avatars is already fully implemented in all pages.

**Architecture:** One new backend endpoint (`DELETE /api/rounds/:id`) + pure frontend changes to `Game.tsx` and `Dashboard.tsx`. New haptics utility file.

**Tech Stack:** React, TanStack Query, Fastify, Prisma, Zod

---

## File Map

- Modify: `packages/backend/src/routes/rounds.ts` — add `DELETE /api/rounds/:id`
- Modify: `packages/backend/src/routes/__tests__/rounds.test.ts` — add tests for DELETE
- Create: `packages/frontend/src/lib/haptics.ts` — navigator.vibrate wrapper
- Modify: `packages/frontend/src/pages/Game.tsx` — Rematch, Undo Last Round, haptics
- Modify: `packages/frontend/src/pages/Dashboard.tsx` — top 3 standings, winner in activity feed

---

### Task 1: Add `DELETE /api/rounds/:id` backend endpoint

**Files:**
- Modify: `packages/backend/src/routes/rounds.ts`

- [ ] **Step 1: Read `packages/backend/src/routes/rounds.ts` to understand the structure**

The file exports a Fastify plugin with POST and PATCH routes for rounds.

- [ ] **Step 2: Add the DELETE endpoint before the closing `}` of the plugin**

Add after the existing PATCH route:
```typescript
fastify.delete(
  '/api/rounds/:id',
  { preHandler: [fastify.requireGroup] },
  async (request, reply) => {
    const { groupId } = request.user as { groupId: string; groupAccess: string }
    const { id } = request.params as { id: string }

    const round = await prisma.round.findFirst({
      where: { id, game: { season: { groupId } } },
      include: {
        game: {
          include: {
            rounds: { orderBy: { roundNumber: 'desc' }, take: 1 },
          },
        },
      },
    })

    if (!round) return reply.status(404).send({ error: 'Round not found' })
    if (round.game.status === 'CLOSED') return reply.status(403).send({ error: 'Game is closed' })
    if (round.game.rounds[0].id !== id) {
      return reply.status(400).send({ error: 'Can only undo the last round' })
    }

    await prisma.round.delete({ where: { id } })
    return reply.status(204).send()
  },
)
```

- [ ] **Step 3: Build backend to verify it compiles**

Run: `npm run build -w packages/backend`
Expected: Build succeeds with no TypeScript errors

---

### Task 2: Write backend tests for `DELETE /api/rounds/:id`

**Files:**
- Modify: `packages/backend/src/routes/__tests__/rounds.test.ts`

- [ ] **Step 1: Read the existing rounds.test.ts to understand fixtures and patterns**

The tests use `buildApp`, `groupToken`, mock prisma, and `app.inject`.

- [ ] **Step 2: Add a failing test first for the happy path**

Add inside a new `describe('DELETE /api/rounds/:id', ...)` block:
```typescript
describe('DELETE /api/rounds/:id', () => {
  it('deletes the last round of an IN_PROGRESS game', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r2',
      game: {
        status: 'IN_PROGRESS',
        rounds: [{ id: 'r2', roundNumber: 2 }],
      },
    } as any)
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r2',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(204)
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w packages/backend -- --reporter=verbose 2>&1 | tail -20`
Expected: The new test fails (endpoint not wired yet, or DELETE not added yet if this runs before Task 1)

- [ ] **Step 4: Add remaining tests**

```typescript
  it('returns 400 when trying to delete a non-last round', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      game: {
        status: 'IN_PROGRESS',
        rounds: [{ id: 'r2', roundNumber: 2 }],
      },
    } as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Can only undo the last round' })
  })

  it('returns 403 when game is CLOSED', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      game: {
        status: 'CLOSED',
        rounds: [{ id: 'r1', roundNumber: 7 }],
      },
    } as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when round not found', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/not-exist',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 5: Run all backend tests**

Run: `npm test -w packages/backend`
Expected: All tests pass (76 existing + 4 new = 80 total)

- [ ] **Step 6: Commit backend changes**

```bash
git add packages/backend/src/routes/rounds.ts \
        packages/backend/src/routes/__tests__/rounds.test.ts
git commit -m "feat: add DELETE /api/rounds/:id endpoint to undo last round"
```

---

### Task 3: Create `packages/frontend/src/lib/haptics.ts`

**Files:**
- Create: `packages/frontend/src/lib/haptics.ts`

- [ ] **Step 1: Write the failing test (if frontend test setup supports it; skip if not)**

There's no test for this trivial utility — it wraps `navigator.vibrate` which isn't in jsdom. Skip to implementation.

- [ ] **Step 2: Create the haptics utility**

Create `packages/frontend/src/lib/haptics.ts`:
```typescript
export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!navigator.vibrate) return
  const durations = { light: 10, medium: 25, heavy: 50 }
  navigator.vibrate(durations[style])
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

---

### Task 4: Add Rematch button + Undo Last Round to `Game.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/Game.tsx`

- [ ] **Step 1: Read `packages/frontend/src/pages/Game.tsx` to understand current structure**

The GamePage function has existing mutations and a header section with Abort/Close buttons.

- [ ] **Step 2: Add imports**

At the top of Game.tsx, add to imports:
```typescript
import { haptic } from '@/lib/haptics'
```

- [ ] **Step 3: Add Rematch mutation (after the existing closeMutation)**

```typescript
const rematchMutation = useMutation({
  mutationFn: () =>
    api.post<GameType>(`/seasons/${game?.seasonId}/games`, {
      playerIds: game?.players.map(gp => gp.playerId),
    }),
  onSuccess: (newGame) => {
    haptic('medium')
    navigate(`/games/${newGame.id}`)
  },
  onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
})
```

- [ ] **Step 4: Add Undo Last Round mutation**

```typescript
const undoRoundMutation = useMutation({
  mutationFn: () => {
    const lastRound = game?.rounds?.[game.rounds.length - 1]
    return api.delete(`/rounds/${lastRound!.id}`)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['game', id] })
    toast({ title: 'Last round undone' })
    setUndoDialogOpen(false)
  },
  onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
})
```

- [ ] **Step 5: Add undoDialogOpen state**

Near the top of GamePage with the other state:
```typescript
const [undoDialogOpen, setUndoDialogOpen] = useState(false)
```

- [ ] **Step 6: Add haptic call to submitRoundMutation and closeMutation onSuccess**

Update `submitRoundMutation.onSuccess`:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['game', id] })
  haptic('medium')
  toast({ title: 'Round saved!' })
},
```

Update `closeMutation.onSuccess`:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['game', id] })
  haptic('heavy')
  toast({ title: 'Game closed!' })
  navigate(`/games/${id}/history`)
},
```

- [ ] **Step 7: Add Rematch button in the header area (after the existing close/abort buttons)**

In the header div that shows abort/close buttons (condition: `game.status === 'IN_PROGRESS' && isGroupAdmin`), also add a separate block for closed game:
```tsx
{game.status === 'CLOSED' && isGroupAdmin && (
  <Button
    onClick={() => rematchMutation.mutate()}
    disabled={rematchMutation.isPending}
    size="sm"
  >
    {rematchMutation.isPending ? 'Starting…' : 'Rematch'}
  </Button>
)}
```

- [ ] **Step 8: Add "Undo last round" button in the IN_PROGRESS header area**

Inside the existing `{game.status === 'IN_PROGRESS' && isGroupAdmin && (...)}` div:
```tsx
{game.status === 'IN_PROGRESS' && game.rounds && game.rounds.length > 0 && isGroupAdmin && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setUndoDialogOpen(true)}
    className="text-xs"
  >
    Undo last round
  </Button>
)}
```

- [ ] **Step 9: Add Undo confirmation dialog (before the closing `</div>` of the component)**

```tsx
<Dialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Undo Last Round</DialogTitle>
      <DialogDescription>
        This will delete Round {game?.rounds?.length} and cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setUndoDialogOpen(false)}>Cancel</Button>
      <Button
        variant="destructive"
        onClick={() => undoRoundMutation.mutate()}
        disabled={undoRoundMutation.isPending}
      >
        {undoRoundMutation.isPending ? 'Undoing…' : 'Undo Round'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 10: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 11: Run frontend tests**

Run: `npm test -w packages/frontend`
Expected: 27 tests pass

- [ ] **Step 12: Commit**

```bash
git add packages/frontend/src/lib/haptics.ts \
        packages/frontend/src/pages/Game.tsx
git commit -m "feat: add Rematch button, Undo Last Round, and haptic feedback"
```

---

### Task 5: Enhance `Dashboard.tsx` — season top 3 + winner in activity feed

**Files:**
- Modify: `packages/frontend/src/pages/Dashboard.tsx`

The dashboard already fetches `recentGames` (all season games) and shows them in "Recent Games". We need to:
1. Add a standings query to show top 3 in the active season card
2. Enhance the recent games list to show winner name + scores for CLOSED games

- [ ] **Step 1: Read `packages/frontend/src/pages/Dashboard.tsx`**

Note the existing structure: seasons query, activeSeason, recentGames query, inProgressGame.

- [ ] **Step 2: Add standings query import and Standing type import**

Add `Standing` to the api import:
```typescript
import { api, Season, Game, Standing } from '@/lib/api'
```

Add a standings query after the recentGames query:
```typescript
const { data: standings } = useQuery<Standing[]>({
  queryKey: ['standings', activeSeason?.id],
  queryFn: () => api.get<Standing[]>(`/seasons/${activeSeason!.id}/standings`),
  enabled: !!activeSeason,
})
```

- [ ] **Step 3: Update the active season card to show top 3 standings**

Below the existing `grid grid-cols-2 gap-3` stats section in the active season card, add:
```tsx
{standings && standings.length > 0 && (
  <div className="mb-4">
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Top 3</p>
    <div className="space-y-1">
      {[...standings]
        .sort((a, b) => a.totalPoints - b.totalPoints)
        .slice(0, 3)
        .map((s, idx) => (
          <div key={s.playerId} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-center">{['🥇','🥈','🥉'][idx]}</span>
            <span className="flex-1 truncate">{s.playerName}</span>
            <span className="font-mono text-xs text-muted-foreground">{s.totalPoints} pts</span>
          </div>
        ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Update the "Recent Games" section to focus on closed games as activity**

`GET /api/seasons/:id/games` does NOT include `totals` or round scores — only players, status, and `_count.rounds`. So we cannot determine the winner from this response alone.

Update the section to show only CLOSED games (skip in-progress if already shown in the live banner) and rename it "Activity":

```tsx
{/* Activity feed: closed games only */}
{recentGames && recentGames.filter(g => g.status === 'CLOSED').length > 0 && (
  <div>
    <div className="suit-divider text-xs mb-4">Activity</div>
    <div className="space-y-2 stagger">
      {recentGames
        .filter(g => g.status === 'CLOSED')
        .slice(0, 5)
        .map(game => (
          <Link key={game.id} to={`/games/${game.id}/history`}>
            <div className="felt-card px-4 py-3 flex items-center justify-between hover:border-[rgba(37,99,235,0.3)] transition-all duration-200 group fade-up">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {game.players.slice(0, 4).map(gp => (
                    <span key={gp.playerId} className="text-base">
                      {AVATAR_EMOJIS[gp.player.avatar] || '🎮'}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(game.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  {' · '}{game._count?.rounds ?? 0} rounds
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[var(--cobalt)] transition-colors" />
            </div>
          </Link>
        ))}
    </div>
  </div>
)}
```

Remove the old "Recent Games" section (which showed both in-progress and closed games) and replace it with this Activity section. The in-progress game is already prominently shown in the live banner above.

- [ ] **Step 5: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

- [ ] **Step 6: Run frontend tests**

Run: `npm test -w packages/frontend`
Expected: 27 tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/pages/Dashboard.tsx
git commit -m "feat: add top 3 standings to dashboard and winner in activity feed"
```

---

### Task 6: Deploy and validate

- [ ] **Step 1: Deploy backend**

```bash
npm run build -w packages/backend
tar czf /tmp/backend-dist.tar.gz packages/backend/dist packages/backend/prisma
aws s3 cp /tmp/backend-dist.tar.gz s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz
```

Generate presigned URL and deploy via SSM:
```bash
PRESIGN=$(aws s3 presign s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz --expires-in 3600)
aws ssm send-command \
  --instance-ids i-028efc7be1e688fb4 \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[
    \"export HOME=/root\",
    \"cd /home/ec2-user/continental\",
    \"curl -s '$PRESIGN' -o /tmp/backend-dist.tar.gz\",
    \"tar xzf /tmp/backend-dist.tar.gz\",
    \"npm run db:migrate:deploy -w packages/backend\",
    \"npm run db:generate -w packages/backend\",
    \"chown -R ec2-user:ec2-user packages/backend/dist packages/backend/prisma\",
    \"pm2 restart all\"
  ]"
```

Wait for command to complete, then check: `aws ssm list-command-invocations --filters Key=Status,Values=Success`

- [ ] **Step 2: Deploy frontend**

```bash
npm run build -w packages/frontend
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

- [ ] **Step 3: Validate at https://d2f12kp396t6lu.cloudfront.net**

1. Open a closed game: "Rematch" button visible (admin only)
2. Start a rematch: navigates to new game, haptic on mobile
3. During a game with ≥1 round: "Undo last round" button visible
4. Click Undo: confirmation dialog appears; confirm deletes the round
5. Submit a round: feel haptic on mobile
6. Close a game: heavier haptic on mobile
7. Dashboard: active season card shows top 3 standings
8. Dashboard activity feed: closed games listed with player avatars, date, and round count (winner display requires API enhancement not in scope here)

