# UI Improvement — Pass 1: Foundation (Infrastructure Only)

## Context

Cleave is functionally complete (Phases 1-6, 373 backend tests passing) but needs a visual polish pass. The UI improvement plan has 7 passes. This session implements **Pass 1: Foundation** — installing shadcn/ui, Google Fonts (Source family), extending the Tailwind theme, and setting up CSS variable theming for dark mode. No page-level component changes.

**Problem**: The current frontend uses hand-built UI primitives (Button, Modal, DataTable) with Unicode characters for icons, no focus traps, no keyboard navigation, system fonts only, and no dark mode support. The foundation pass establishes the infrastructure that Passes 2-7 build on.

---

## Files Modified (4)

| File | Change |
|------|--------|
| `frontend/index.html` | Add Google Fonts preconnect + link tags |
| `frontend/src/index.css` | Add shadcn CSS variable theming (light + dark), set font-body as base, preserve gradient variable |
| `frontend/tailwind.config.js` | Add darkMode, font families (display/body/mono), shadcn color tokens alongside existing colors, borderRadius variables, tailwindcss-animate plugin |
| `frontend/postcss.config.js` | No change expected (verify only) |

## Files Created (2)

| File | Purpose |
|------|---------|
| `frontend/src/lib/cn.ts` | `cn()` class merging utility (clsx + tailwind-merge) — shadcn components import from here instead of frozen `utils.ts` |
| `frontend/components.json` | shadcn/ui configuration — sets "new-york" style, aliases `utils` to `@/lib/cn`, enables CSS variables |

## Files NOT Modified (frozen)

- `frontend/src/lib/utils.ts` — frozen per constraints
- `frontend/src/lib/constants.ts` — frozen per constraints
- All files under `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/api/`, `frontend/src/hooks/`, `frontend/src/contexts/`
- All files under `backend/`

---

## Step-by-Step Implementation

### Step 1: Install npm dependencies

```bash
cd frontend
npm install clsx tailwind-merge tailwindcss-animate class-variance-authority lucide-react
```

These are the core shadcn/ui runtime dependencies:
- `clsx` + `tailwind-merge` — for the `cn()` utility
- `tailwindcss-animate` — Tailwind plugin for entrance/exit animations
- `class-variance-authority` — variant-based class composition (used by shadcn button, badge, etc.)
- `lucide-react` — icon library (used by shadcn dialog close button, dropdown chevrons, etc.)

### Step 2: Create `frontend/src/lib/cn.ts`

```ts
// frontend/src/lib/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Why a separate file**: `utils.ts` is frozen. shadcn components need `cn()`. The `components.json` aliases `utils` → `@/lib/cn` so all shadcn-generated components import from here automatically.

### Step 3: Create `frontend/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Key decisions:
- `"style": "new-york"` — denser, more professional than "Default"
- `"rsc": false` — Vite SPA, no React Server Components
- `"aliases.utils": "@/lib/cn"` — redirects away from frozen `utils.ts`
- `"tailwind.baseColor": "neutral"` — neutral gray scale matching existing gray usage

### Step 4: Modify `frontend/tailwind.config.js`

Replace the entire file. The merge strategy:
- **`primary`**: Changes from static hex `#4AAED9` to `hsl(var(--primary))` so it works with CSS variable theming. The CSS variable `--primary` is set to the HSL equivalent of `#4AAED9` (Step 5), so all existing `bg-primary`/`text-primary` usages render identically. The `dark` sub-key stays as static hex (only used by old Button hover).
- **`status-*` colors**: Stay as static hex — they represent semantic status meanings, not theming tokens.
- **`accent`**: Gains `DEFAULT` and `foreground` CSS-variable values alongside preserved `teal` and `gold` sub-keys. Existing code uses `accent-teal`/`accent-gold` (never bare `accent`), so no conflict.
- **Font families**: `display` (Source Serif 4), `body` (Source Sans 3), `mono` (Source Code Pro)
- **`darkMode: ['class']`**: Enables class-based dark mode
- **`tailwindcss-animate` plugin**: Required by shadcn components

**Note on ESM**: The config uses `export default` (ESM). The `tailwindcss-animate` import uses ESM syntax (`import ... from`), not `require()`.

New file content:

```js
// frontend/tailwind.config.js
import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Existing Cleave tokens (preserved)
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          dark: '#3A8EBF',
        },
        status: {
          new: '#3F51B5',
          'in-progress': '#00BCD4',
          complete: '#4CAF50',
          error: '#B71C1C',
          terminated: '#9E9E9E',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          teal: '#2BBCC4',
          gold: '#F5A623',
        },
        // shadcn semantic tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"Source Code Pro"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
```

### Step 5: Modify `frontend/src/index.css`

Replace the entire file. Key decisions:
- `--background: 210 16.7% 97.6%` = `#F8F9FA` (subtle off-white, per design doc)
- `--primary: 198 65.3% 57.1%` = exact HSL of `#4AAED9`
- `--destructive: 0 73.5% 41.4%` = maps to existing `status-error` (`#B71C1C`)
- `--ring: 198 65.3% 57.1%` = focus rings use primary color
- `--gradient-bg` preserved exactly
- `font-body` applied to `<body>` (Source Sans 3 with system-ui fallback)
- `* { @apply border-border }` = shadcn standard for themed default borders
- Dark mode `.dark` class provides dark background, light text, same primary

```css
/* frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Cleave brand gradient (preserved) */
    --gradient-bg: linear-gradient(
      180deg,
      #87ceeb 0%,
      #7ecfcf 25%,
      #90d5a0 50%,
      #c5d94e 75%,
      #e8b84b 100%
    );

    /* shadcn theme tokens — light mode */
    --background: 210 16.7% 97.6%;
    --foreground: 220 14.3% 15.9%;
    --card: 0 0% 100%;
    --card-foreground: 220 14.3% 15.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 220 14.3% 15.9%;
    --primary: 198 65.3% 57.1%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14.3% 95.9%;
    --secondary-foreground: 220 14.3% 15.9%;
    --muted: 220 14.3% 95.9%;
    --muted-foreground: 220 8.9% 46.1%;
    --accent: 220 14.3% 95.9%;
    --accent-foreground: 220 14.3% 15.9%;
    --destructive: 0 73.5% 41.4%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 198 65.3% 57.1%;
    --radius: 0.5rem;
    --chart-1: 198 65.3% 57.1%;
    --chart-2: 183.1 64% 46.9%;
    --chart-3: 230.8 48.4% 47.8%;
    --chart-4: 37.4 91.3% 54.9%;
    --chart-5: 122.4 39.4% 49.2%;
  }

  .dark {
    --gradient-bg: linear-gradient(
      180deg,
      #1a2332 0%,
      #1c2d3a 25%,
      #1a2a2e 50%,
      #1e2a24 75%,
      #1f2520 100%
    );

    --background: 224 71.4% 4.1%;
    --foreground: 210 20% 98%;
    --card: 224 71.4% 6%;
    --card-foreground: 210 20% 98%;
    --popover: 224 71.4% 6%;
    --popover-foreground: 210 20% 98%;
    --primary: 198 65.3% 57.1%;
    --primary-foreground: 0 0% 100%;
    --secondary: 215 27.9% 16.9%;
    --secondary-foreground: 210 20% 98%;
    --muted: 215 27.9% 16.9%;
    --muted-foreground: 217.9 10.6% 64.9%;
    --accent: 215 27.9% 16.9%;
    --accent-foreground: 210 20% 98%;
    --destructive: 0 62.8% 50.6%;
    --destructive-foreground: 0 0% 100%;
    --border: 215 27.9% 16.9%;
    --input: 215 27.9% 16.9%;
    --ring: 198 65.3% 57.1%;
    --chart-1: 198 65.3% 62%;
    --chart-2: 183.1 64% 52%;
    --chart-3: 230.8 48.4% 55%;
    --chart-4: 37.4 91.3% 60%;
    --chart-5: 122.4 39.4% 55%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-body;
    margin: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

### Step 6: Modify `frontend/index.html`

Add Google Fonts preconnect and link tags in `<head>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cleave</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Fonts loaded: Source Serif 4 (600, 700), Source Sans 3 (400, 500, 600), Source Code Pro (400, 500). `display=swap` prevents FOIT.

### Step 7: Install shadcn components

```bash
cd frontend
npx shadcn@latest add dialog dropdown-menu tabs tooltip select sonner separator badge collapsible scroll-area -y
```

This installs Radix UI primitives as npm dependencies and generates component `.tsx` files in `src/components/ui/` (lowercase filenames: `dialog.tsx`, `dropdown-menu.tsx`, etc.).

**`button` is deliberately excluded** — it will be installed in Pass 2 when the existing `Button.tsx` is being replaced. This avoids case-insensitive filesystem collision and breaking 38+ existing import sites.

**If `shadcn add` tries to overwrite `index.css` or `tailwind.config.js`**: Review diffs carefully. Our pre-configured files already contain everything shadcn needs, so any overwrites should be rejected or reverted.

### Step 8: Verify

```bash
cd frontend
npm run typecheck   # Zero errors
npm run lint        # Zero new errors
npm run build       # Successful production build
```

Manual browser verification:
- Body text renders in Source Sans 3 (check DevTools > Network > filter "font")
- Background behind cards is subtle off-white (`#F8F9FA`), not pure white
- Gradient still renders on login/register pages
- All `bg-primary` / `text-primary` elements still show `#4AAED9` blue
- Status badges still show correct colors
- No visual regressions on any page
- Existing components (Button, Modal, DataTable, etc.) unchanged

---

## Potential Pitfalls

| Risk | Mitigation |
|------|-----------|
| `shadcn add` overwrites `utils.ts` | `components.json` aliases utils to `@/lib/cn` — should not touch `utils.ts`. If it does, revert immediately. |
| `shadcn add` modifies `tailwind.config.js` | Pre-configured in Step 4. Review any diffs, revert unwanted changes. |
| `tailwindcss-animate` `require()` fails in ESM | Using `import tailwindcssAnimate from 'tailwindcss-animate'` instead of `require()`. |
| Case-insensitive filesystem collisions | Excluded `button` from shadcn install. Verified no other name collisions between PascalCase existing files and lowercase shadcn files. |
| `noUnusedLocals: true` flags shadcn files | shadcn components export everything they define — no unused locals. Verified safe. |
| Primary color opacity modifiers break | CSS variables store raw HSL values (`198 65.3% 57.1%`), config uses `hsl(var(--primary))` — Tailwind v3.4 handles `bg-primary/50` correctly with this pattern. |

---

## What Pass 2 Inherits

After Pass 1, the following is available for Pass 2 (Core UI Components):
- `cn()` utility for class merging
- `lucide-react` for icons
- shadcn `dialog`, `dropdown-menu`, `tabs`, `tooltip`, `select`, `sonner`, `separator`, `badge`, `collapsible`, `scroll-area` components — all themed to Cleave's colors
- Font classes: `font-display`, `font-body`, `font-mono`
- Dark mode CSS variables ready (toggle UI added in Pass 7)
- `tailwindcss-animate` for entrance/exit animations
