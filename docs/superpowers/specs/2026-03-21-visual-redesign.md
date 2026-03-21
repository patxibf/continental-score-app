# Visual Redesign — Cobalt + Inter

**Goal:** Replace the dark casino/felt theme with a bright, modern cobalt palette and Inter typeface across every page of the app.

**Architecture:** Pure CSS token swap — no component logic changes. All colours are CSS custom properties in `index.css` consumed via Tailwind's `hsl(var(--...))` pattern, so changing the root variables cascades automatically. Font swap requires updating the Google Fonts import and removing all references to Cormorant Garamond and DM Sans.

**Tech Stack:** Tailwind CSS, CSS custom properties, Google Fonts

---

## Colour Tokens

Replace the entire `:root` block in `packages/frontend/src/index.css`:

```css
:root {
  --background: 220 25% 97%;       /* #f4f6fb — very light blue-grey */
  --foreground: 224 40% 18%;       /* #1a2540 — near-black navy */
  --card: 0 0% 100%;               /* #ffffff — white */
  --card-foreground: 224 40% 18%;
  --popover: 0 0% 100%;
  --popover-foreground: 224 40% 18%;
  --primary: 221 83% 53%;          /* #2563eb — cobalt blue */
  --primary-foreground: 0 0% 100%;
  --secondary: 220 20% 94%;        /* #eef1f8 */
  --secondary-foreground: 224 40% 18%;
  --muted: 220 18% 92%;
  --muted-foreground: 224 20% 50%; /* #6b7a99 */
  --accent: 221 83% 96%;           /* #eff3ff — light cobalt tint */
  --accent-foreground: 224 40% 18%;
  --destructive: 0 65% 48%;
  --destructive-foreground: 0 0% 100%;
  --border: 220 20% 88%;           /* #dde3f0 */
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

Remove old tokens: `--gold`, `--gold-bright`, `--gold-dim`, `--felt`, `--felt-card`, `--cream`, `--crimson`.

---

## Typography

Replace Google Fonts import:

```css
/* Remove */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* Add */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
```

Update base typography:

```css
html {
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  letter-spacing: -0.02em;
}
```

---

## Body Background

Replace the felt texture and gold radial gradient:

```css
body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  min-height: 100vh;
}
```

---

## Component Classes

Update all custom component classes to use cobalt tokens:

```css
/* felt-card → plain white card */
.felt-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}

/* text-gold → text-cobalt */
.text-gold { color: var(--cobalt); }
.text-gold-bright { color: var(--cobalt-dark); }

/* stat-number */
.stat-number {
  font-family: 'DM Mono', monospace;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--cobalt-dark);
}

/* gold-glow → cobalt-glow */
.gold-glow {
  box-shadow: 0 0 20px rgba(37,99,235,0.12), 0 0 60px rgba(37,99,235,0.04);
}

/* rank-badge */
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

/* suit-divider */
.suit-divider {
  color: var(--text-muted);
}
.suit-divider::before,
.suit-divider::after {
  background: linear-gradient(to right, transparent, var(--border-color), transparent);
}

/* score-bar */
.score-bar { background: var(--cobalt-light); }
.score-bar-fill { background: linear-gradient(to right, var(--cobalt-mid), var(--cobalt)); }
```

---

## Recharts Overrides

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

---

## Inline Hardcoded Styles

Several pages use inline hardcoded felt/gold colours that won't be caught by token replacement:

- `packages/frontend/src/pages/Admin.tsx` — `bg-[var(--felt-card)]`, `border-[rgba(201,168,76,0.2)]`, `focus:border-[var(--gold)]`
- `packages/frontend/src/pages/Game.tsx` — gold colour references
- Any `bg-[#0e1a13]`, `bg-[#111e16]`, `text-[#c9a84c]`, `text-[#e8c76a]` inline classes

These must be replaced with cobalt equivalents:
- `bg-[var(--felt-card)]` → `bg-white`
- `border-[rgba(201,168,76,0.2)]` → `border-[var(--border-color)]`
- `focus:border-[var(--gold)]` → `focus:border-[var(--cobalt)]`
- `text-[#c9a84c]` / `text-[#e8c76a]` → `text-[var(--cobalt)]`

---

## Testing

```bash
npm run build -w packages/frontend   # must compile cleanly
npm test -w packages/frontend        # 27 tests must pass
```

Visual check: open dev server and verify:
- Login page looks clean (no dark background)
- Dashboard, Seasons, Game, Stats pages all use light background
- No gold/felt colours remaining anywhere

---

## Deployment

```bash
# Build
npm run build -w packages/frontend

# Deploy frontend to S3
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

No backend deployment needed.

---

## Validation

Open https://d2f12kp396t6lu.cloudfront.net and verify:
- Light cobalt theme visible on login page
- No dark/gold colours on any page
- Inter font rendering (not Cormorant Garamond or DM Sans)
- Numbers still in DM Mono
