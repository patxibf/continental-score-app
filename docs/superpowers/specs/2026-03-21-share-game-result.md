# Share Game Result

**Goal:** On any closed game, let users share the final result as a formatted text message — one tap to share via the native share sheet (iOS/Android) or copy to clipboard (desktop).

**Architecture:** Pure frontend. No backend changes. Generates text from data already on the Game page. Uses the Web Share API with a clipboard fallback.

**Tech Stack:** React, Web Share API, Clipboard API

---

## Share Text Format

```
🃏 Continental — Summer 2026, Game #4

🏆 Andrés · 224 pts ⚡
2. María · 287 pts
3. Carlos · 312 pts
4. Laura · 345 pts

Played 7 rounds · via Continental app
```

Rules:
- Players sorted ascending by total score (lower = better)
- Winner (rank 1) gets 🏆 prefix
- Players who went out at least once get ⚡ suffix on their line
- Game name derived from season name + game index in that season
- "Played N rounds" from `game.rounds.length`

---

## Implementation

**File:** `packages/frontend/src/pages/Game.tsx`

### Share utility function

```typescript
function buildShareText(game: GameWithDetails, totals: Record<string, number>): string {
  const ranked = [...game.players]
    .map(gp => ({ ...gp, total: totals[gp.playerId] ?? 0 }))
    .sort((a, b) => a.total - b.total)

  const wentOutPlayers = new Set(
    game.rounds.flatMap(r => r.scores.filter(s => s.wentOut).map(s => s.playerId))
  )

  const lines = ranked.map((p, i) => {
    const prefix = i === 0 ? '🏆' : `${i + 1}.`
    const suffix = wentOutPlayers.has(p.playerId) ? ' ⚡' : ''
    return `${prefix} ${p.player.name} · ${p.total} pts${suffix}`
  })

  return [
    `🃏 Continental — ${game.season.name}, Game #${gameIndex}`,
    '',
    ...lines,
    '',
    `Played ${game.rounds.length} rounds · via Continental app`,
  ].join('\n')
}
```

### Share button

```typescript
async function handleShare() {
  const text = buildShareText(game, totals)

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

### Button placement

Show on closed games only, next to the game header. Visible to all users (both admin and member access).

```tsx
{game.status === 'CLOSED' && (
  <Button variant="outline" size="sm" onClick={handleShare}>
    Share result
  </Button>
)}
```

### Game index

The share text says "Game #N". Get the game's position by fetching or deriving it from the season's games list. The simplest approach: sort all games in the season by `createdAt` and find this game's index.

---

## Testing

```bash
npm test -w packages/frontend  # 27 tests pass
npm run build -w packages/frontend
```

Unit test for `buildShareText`:
```typescript
describe('buildShareText', () => {
  it('ranks players by ascending total score', () => { ... })
  it('marks winner with 🏆', () => { ... })
  it('adds ⚡ for players who went out', () => { ... })
})
```

---

## Deployment

**Frontend only:**
```bash
npm run build -w packages/frontend
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

---

## Validation

1. On a closed game page: "Share result" button is visible
2. On mobile (iOS/Android): tapping it opens the native share sheet with formatted text
3. On desktop: tapping it copies the text and shows "Result copied to clipboard" toast
4. The formatted text is correct: sorted by score, winner has 🏆, went-out players have ⚡
