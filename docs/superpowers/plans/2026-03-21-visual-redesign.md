# Visual Redesign — Cobalt + Inter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark casino/felt theme with a bright cobalt palette and Inter typeface.

**Architecture:** Pure CSS token swap + inline class cleanup. No component logic changes, no backend changes.

**Tech Stack:** Tailwind CSS, CSS custom properties, Google Fonts

---

## File Map

- Modify: `packages/frontend/src/index.css` — font import, :root tokens, body/html, component classes, recharts overrides
- Modify: `packages/frontend/src/pages/Admin.tsx` — inline gold/felt classes
- Modify: `packages/frontend/src/pages/Game.tsx` — inline gold/felt classes + Cormorant font refs
- Modify: `packages/frontend/src/pages/Players.tsx` — inline gold/felt classes
- Modify: `packages/frontend/src/pages/SeasonDetail.tsx` — inline gold/felt classes
- Modify: `packages/frontend/src/pages/Dashboard.tsx` — inline gold/felt classes
- Modify: `packages/frontend/src/pages/Stats.tsx` — hardcoded GOLD hex constants + inline classes
- Modify: `packages/frontend/src/pages/PlayerStats.tsx` — hardcoded GOLD hex constants + inline classes
- Modify: `packages/frontend/src/pages/GameHistory.tsx` — inline gold/felt classes

---

### Task 1: Update `packages/frontend/src/index.css` — fonts, tokens, base styles

**Files:**
- Modify: `packages/frontend/src/index.css`

- [ ] **Step 1: Replace the Google Fonts import (line 1)**

Replace:
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
```
With:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
```

- [ ] **Step 2: Replace the entire `:root` block inside `@layer base`**

Replace the existing `:root { ... }` block with:
```css
:root {
  --background: 220 25% 97%;
  --foreground: 224 40% 18%;
  --card: 0 0% 100%;
  --card-foreground: 224 40% 18%;
  --popover: 0 0% 100%;
  --popover-foreground: 224 40% 18%;
  --primary: 221 83% 53%;
  --primary-foreground: 0 0% 100%;
  --secondary: 220 20% 94%;
  --secondary-foreground: 224 40% 18%;
  --muted: 220 18% 92%;
  --muted-foreground: 224 20% 50%;
  --accent: 221 83% 96%;
  --accent-foreground: 224 40% 18%;
  --destructive: 0 65% 48%;
  --destructive-foreground: 0 0% 100%;
  --border: 220 20% 88%;
  --input: 220 20% 88%;
  --ring: 221 83% 53%;
  --radius: 0.75rem;

  /* Custom tokens */
  --cobalt: #2563eb;
  --cobalt-light: #eff3ff;
  --cobalt-dark: #1e3a8a;
  --cobalt-mid: #3b5cc4;
  --text-primary: #1a2540;
  --text-muted: #6b7a99;
  --border-color: #dde3f0;
}
```

- [ ] **Step 3: Update base html/body/heading styles (inside `@layer base`)**

Replace:
```css
html {
  font-family: 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(201,168,76,0.07) 0%, transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpath d='M0 0h60v60H0z' fill='none'/%3E%3Ccircle cx='30' cy='30' r='1' fill='rgba(201,168,76,0.04)'/%3E%3C/svg%3E");
  min-height: 100vh;
}

h1, h2, h3 {
  font-family: 'Cormorant Garamond', serif;
  letter-spacing: -0.01em;
}
```
With:
```css
html {
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  min-height: 100vh;
}

h1, h2, h3 {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  letter-spacing: -0.02em;
}
```

- [ ] **Step 4: Update component classes inside `@layer components`**

Replace the entire `@layer components { ... }` block with:
```css
@layer components {
  .felt-card {
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
  }

  .text-gold { color: var(--cobalt); }
  .text-gold-bright { color: var(--cobalt-dark); }

  .stat-number {
    font-family: 'DM Mono', monospace;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--cobalt-dark);
  }

  .gold-glow {
    box-shadow: 0 0 20px rgba(37,99,235,0.12), 0 0 60px rgba(37,99,235,0.04);
  }

  .rank-badge {
    background: var(--cobalt-dark);
    color: white;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    min-width: 1.4rem;
    text-align: center;
  }

  .suit-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .suit-divider::before,
  .suit-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--border-color), transparent);
  }

  .score-bar {
    height: 3px;
    background: var(--cobalt-light);
    border-radius: 999px;
    overflow: hidden;
  }
  .score-bar-fill {
    height: 100%;
    background: linear-gradient(to right, var(--cobalt-mid), var(--cobalt));
    border-radius: 999px;
    transition: width 1s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .fade-up {
    animation: fadeUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .stagger > *:nth-child(1) { animation-delay: 0ms; }
  .stagger > *:nth-child(2) { animation-delay: 60ms; }
  .stagger > *:nth-child(3) { animation-delay: 120ms; }
  .stagger > *:nth-child(4) { animation-delay: 180ms; }
  .stagger > *:nth-child(5) { animation-delay: 240ms; }
  .stagger > *:nth-child(6) { animation-delay: 300ms; }
  .stagger > *:nth-child(7) { animation-delay: 360ms; }
  .stagger > *:nth-child(8) { animation-delay: 420ms; }
}
```

- [ ] **Step 5: Update Recharts overrides**

Replace:
```css
.recharts-cartesian-grid-horizontal line,
.recharts-cartesian-grid-vertical line {
  stroke: rgba(201, 168, 76, 0.08) !important;
}
.recharts-text {
  fill: rgba(240, 232, 216, 0.45) !important;
  font-family: 'DM Mono', monospace !important;
  font-size: 11px !important;
}
```
With:
```css
.recharts-cartesian-grid-horizontal line,
.recharts-cartesian-grid-vertical line {
  stroke: var(--border-color) !important;
}
.recharts-text {
  fill: var(--text-muted) !important;
  font-family: 'DM Mono', monospace !important;
  font-size: 11px !important;
}
```

- [ ] **Step 6: Build to verify no CSS errors**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds (no CSS parse errors)

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/index.css
git commit -m "style: replace gold/felt theme with cobalt palette and Inter font"
```

---

### Task 2: Update inline styles in `Admin.tsx`, `Players.tsx`, `Game.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/Admin.tsx`
- Modify: `packages/frontend/src/pages/Players.tsx`
- Modify: `packages/frontend/src/pages/Game.tsx`

The strategy for all pages: find all occurrences of gold/felt color values and replace with cobalt equivalents using the mapping below.

**Color mapping:**
| Old | New |
|-----|-----|
| `var(--gold)` | `var(--cobalt)` |
| `var(--gold-bright)` | `var(--cobalt-dark)` |
| `var(--gold-dim)` | `var(--cobalt-mid)` |
| `var(--felt-card)` | `white` |
| `var(--felt)` | `hsl(var(--background))` |
| `rgba(201,168,76,0.2)` or `rgba(201, 168, 76, 0.2)` | `var(--border-color)` |
| `rgba(201,168,76,0.08)` or similar faint gold | `rgba(37,99,235,0.08)` |
| `rgba(201,168,76,0.06)` | `rgba(37,99,235,0.06)` |
| `rgba(201,168,76,0.1)` | `rgba(37,99,235,0.1)` |
| `rgba(201,168,76,0.12)` | `rgba(37,99,235,0.12)` |
| `rgba(201,168,76,0.15)` | `rgba(37,99,235,0.15)` |
| `rgba(201,168,76,0.25)` | `rgba(37,99,235,0.25)` |
| `rgba(201,168,76,0.3)` | `rgba(37,99,235,0.3)` |
| `rgba(201,168,76,0.35)` | `rgba(37,99,235,0.35)` |
| `rgba(201,168,76,0.4)` | `rgba(37,99,235,0.4)` |
| `rgba(201,168,76,0.5)` | `rgba(37,99,235,0.5)` |
| `rgba(201,168,76,0.55)` | `rgba(37,99,235,0.55)` |
| `rgba(255,255,255,0.04)` (dark bg input) | `hsl(var(--secondary))` |
| `rgba(255,255,255,0.02)` (dark bg button) | `transparent` |
| `rgba(255,255,255,0.03)` | `transparent` |
| `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.05)` |
| `bg-[#0e1a13]` | `bg-[hsl(var(--background))]` |
| `bg-[#111e16]` | `bg-white` |
| `text-[#c9a84c]` | `text-[var(--cobalt)]` |
| `text-[#e8c76a]` | `text-[var(--cobalt-dark)]` |
| `fontFamily: 'Cormorant Garamond, serif'` | remove the entire style prop (or change to `fontFamily: 'Inter, sans-serif'` if needed for weight) |
| `fontFamily: 'Cormorant Garamond, serif'` on stat-number-like elements | remove (stat-number class now handles it) |
| `var(--gold-bright)` in stroke/fill SVG | `var(--cobalt-dark)` |

- [ ] **Step 1: Update `Admin.tsx`**

Read the file. Apply the color mapping to all className and style attribute values. Key changes:
- DialogContent: `bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]` → `bg-white border-[var(--border-color)]`
- Input classes: `bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)]` → `focus:border-[var(--cobalt)] focus:ring-0`
- Title with Cormorant: remove `fontFamily: 'Cormorant Garamond, serif'`
- All gold color references → cobalt equivalents per mapping

- [ ] **Step 2: Update `Players.tsx`**

Apply the color mapping. Key changes:
- DialogContent: `bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]` → `bg-white border-[var(--border-color)]`
- Input: gold border/focus → cobalt
- Avatar buttons: gold border/bg classes → cobalt equivalents
- Player list: `bg-[rgba(201,168,76,0.08)] border border-[rgba(201,168,76,0.12)]` → `bg-accent border border-border`
- h1 Cormorant + gold → Inter (remove fontFamily) + `text-[var(--cobalt-dark)]`
- Hover classes: `hover:text-[var(--gold)]` → `hover:text-[var(--cobalt)]`

- [ ] **Step 3: Update `Game.tsx`**

Apply the color mapping. Key changes:
- ScoreEntry buttons: gold border/bg → cobalt
- Input: gold border/focus → cobalt
- Score display: `color: 'var(--gold-bright)'` and `color: 'var(--gold)'` → cobalt
- Completed rounds divider and card styles: gold → cobalt
- Round progress bars: gold gradient → cobalt gradient
- Dialog backgrounds: `bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]` → `bg-white border-[var(--border-color)]`
- h1 Cormorant → remove fontFamily
- "All 7 rounds complete!" card: gold classes → cobalt

- [ ] **Step 4: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/Admin.tsx \
        packages/frontend/src/pages/Players.tsx \
        packages/frontend/src/pages/Game.tsx
git commit -m "style: replace gold/felt inline classes with cobalt in Admin, Players, Game"
```

---

### Task 3: Update inline styles in `SeasonDetail.tsx`, `Dashboard.tsx`, `GameHistory.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/SeasonDetail.tsx`
- Modify: `packages/frontend/src/pages/Dashboard.tsx`
- Modify: `packages/frontend/src/pages/GameHistory.tsx`

Apply the same color mapping from Task 2.

- [ ] **Step 1: Update `SeasonDetail.tsx`**

Key changes:
- h1 with Cormorant + gold → remove fontFamily, `text-[var(--cobalt-dark)]`
- Season status badge: gold border/bg → cobalt
- Standings sort buttons: `bg-[var(--gold)]` for active → `bg-[var(--cobalt)]`
- Standings container: gold border classes → cobalt
- Score bars: inherit from class (already updated in index.css)
- Game cards: gold hover → cobalt hover
- Dialog: `bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]` → `bg-white border-[var(--border-color)]`

- [ ] **Step 2: Update `Dashboard.tsx`**

Key changes:
- h1 Cormorant + gold → remove fontFamily, `text-[var(--cobalt-dark)]`
- Live game banner: gold border/glow/pulse → cobalt
- "Continue →" text gold → cobalt
- Round progress bars: gold colors → cobalt
- Active season card: gold badge, gold stat numbers → cobalt
- h2 Cormorant → remove fontFamily
- Recent games cards: gold hover → cobalt
- All `var(--gold)` → `var(--cobalt)` and `rgba(201,168,76,...)` → `rgba(37,99,235,...)`

- [ ] **Step 3: Update `GameHistory.tsx`**

Key changes:
- h1 Cormorant + gold → remove fontFamily, `text-[var(--cobalt-dark)]`
- Winner spotlight card: gold border/glow → cobalt
- `bg-[radial-gradient(...rgba(201,168,76,...)...)]` → `bg-[radial-gradient(...rgba(37,99,235,...)...)]`
- Standings: gold colors → cobalt
- Round breakdown: gold colors → cobalt
- `stat-number` class (already updated via index.css)

- [ ] **Step 4: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/SeasonDetail.tsx \
        packages/frontend/src/pages/Dashboard.tsx \
        packages/frontend/src/pages/GameHistory.tsx
git commit -m "style: replace gold/felt inline classes with cobalt in SeasonDetail, Dashboard, GameHistory"
```

---

### Task 4: Update hardcoded hex constants in `Stats.tsx` and `PlayerStats.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/Stats.tsx`
- Modify: `packages/frontend/src/pages/PlayerStats.tsx`

These files have hardcoded hex constants at the top rather than CSS vars.

- [ ] **Step 1: Update `Stats.tsx` color constants**

Replace:
```typescript
const GOLD = '#c9a84c'
const GOLD_DIM = '#7a6230'
const GOLD_BRIGHT = '#e8c76a'
const PALETTE = [GOLD_BRIGHT, GOLD, '#a07a38', GOLD_DIM, '#5a4520', '#3d2f15', '#261e0d', '#1a1508']
```
With:
```typescript
const COBALT = '#2563eb'
const COBALT_MID = '#3b5cc4'
const COBALT_DARK = '#1e3a8a'
const PALETTE = ['#6b8ce8', COBALT, COBALT_MID, COBALT_DARK, '#1a3070', '#142558', '#0e1a40', '#09122e']
```

Then replace all uses of `GOLD`, `GOLD_BRIGHT`, `GOLD_DIM` in JSX/chart props with their cobalt counterparts:
- `GOLD_BRIGHT` → `COBALT_DARK` (used for top rank color)
- `GOLD` → `COBALT`
- `GOLD_DIM` → `COBALT_MID`

Also update `CustomTooltip`:
- `text-[var(--gold)]` → `text-[var(--cobalt)]`
- `text-[var(--gold-bright)]` → `text-[var(--cobalt-dark)]`

Also update other inline classes in Stats.tsx:
- h1 Cormorant + gold → remove fontFamily, cobalt
- Loading skeleton: `bg-[rgba(201,168,76,0.04)]` → `bg-accent`
- Leaderboard cards: gold hover/shadow → cobalt
- Bar chart tooltip cursor: `rgba(201,168,76,0.05)` → `rgba(37,99,235,0.05)`
- WinRateRing SVG: `rgba(201,168,76,0.1)` stroke → `rgba(37,99,235,0.1)`, goldGrad gradient → cobalt gradient
- All `text-[var(--gold)]`, `text-[var(--gold-bright)]` → cobalt equivalents

- [ ] **Step 2: Update `PlayerStats.tsx` color constants**

Replace:
```typescript
const GOLD = '#c9a84c'
const GOLD_BRIGHT = '#e8c76a'
const GOLD_DIM = '#7a6230'
```
With:
```typescript
const COBALT = '#2563eb'
const COBALT_DARK = '#1e3a8a'
const COBALT_MID = '#3b5cc4'
```

Replace all uses of `GOLD`, `GOLD_BRIGHT`, `GOLD_DIM` with cobalt equivalents in chart props and JSX.

Also update inline classes:
- h1 Cormorant + gold → remove fontFamily, cobalt
- Player avatar circle: gold border → `border-[var(--border-color)]`, bg → `bg-accent`
- StatTile: gold border for highlight → `border-[var(--cobalt)]`; font color → cobalt
- `fontFamily: 'Cormorant Garamond, serif'` in StatTile value → remove
- AreaChart area fill gradient: goldGrad → cobaltGrad with cobalt colors
- ReferenceLine stroke: GOLD_DIM → COBALT_MID; label fill → COBALT_MID
- Recent games cards: gold → cobalt

- [ ] **Step 3: Run all frontend tests**

Run: `npm test -w packages/frontend`
Expected: 27 tests pass

- [ ] **Step 4: Build**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/Stats.tsx \
        packages/frontend/src/pages/PlayerStats.tsx
git commit -m "style: replace hardcoded gold hex constants with cobalt in Stats and PlayerStats"
```

---

### Task 5: Deploy and validate

- [ ] **Step 1: Deploy frontend to S3 + CloudFront**

```bash
npm run build -w packages/frontend
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

- [ ] **Step 2: Validate visual at https://d2f12kp396t6lu.cloudfront.net**

Open in browser. Verify:
1. Login page: white/light background, blue cobalt button, Inter font (not serif)
2. Dashboard: white cards, navy/cobalt heading, no gold/felt colors
3. Seasons page: cobalt accents, white cards
4. Game page: cobalt score bars, blue accent colors
5. Stats page: cobalt bar chart, blue win-rate rings
6. Admin page: no gold borders, no dark background
7. No dark/felt green backgrounds anywhere
8. Numbers still in DM Mono font

