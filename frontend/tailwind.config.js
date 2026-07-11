// frontend/tailwind.config.js — maps the Fieldbook token sheet (src/index.css) into Tailwind.
import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // Job/experiment status. Dot = DEFAULT; badge text = foreground on a /10 tint.
        status: {
          new: {
            DEFAULT: 'hsl(var(--status-new))',
            foreground: 'hsl(var(--status-new-foreground))',
          },
          queued: {
            DEFAULT: 'hsl(var(--status-queued))',
            foreground: 'hsl(var(--status-queued-foreground))',
          },
          running: {
            DEFAULT: 'hsl(var(--status-running))',
            foreground: 'hsl(var(--status-running-foreground))',
          },
          complete: {
            DEFAULT: 'hsl(var(--status-complete))',
            foreground: 'hsl(var(--status-complete-foreground))',
          },
          error: {
            DEFAULT: 'hsl(var(--status-error))',
            foreground: 'hsl(var(--status-error-foreground))',
          },
          terminated: {
            DEFAULT: 'hsl(var(--status-terminated))',
            foreground: 'hsl(var(--status-terminated-foreground))',
          },
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // Semantic intents
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        // Ember: live-signal accent. Non-text uses only in light mode (text → warning).
        ember: {
          DEFAULT: 'hsl(var(--ember))',
          foreground: 'hsl(var(--ember-foreground))',
        },
        // shadcn semantic tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        overlay: 'hsl(var(--overlay))',
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
          6: 'hsl(var(--chart-6))',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      // ~1.2 minor-third ramp on a 15px UI base. Display sizes carry negative tracking.
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.05rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.45rem' }],
        lg: ['1.0625rem', { lineHeight: '1.55rem' }],
        xl: ['1.25rem', { lineHeight: '1.7rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.375rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Landing identity motion (Field Atlas) — see PLAN-landing.md. The em-relative
        // travel keeps hero-rise proportional to the responsive wordmark size; one
        // particle-float keyframe serves the whole field via --drift-x/--drift-y.
        'hero-rise': {
          from: { opacity: '0', transform: 'translateY(0.4em)' },
          to: { opacity: '1', transform: 'none' },
        },
        'particle-float': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(calc(var(--drift-x) * 0.6), calc(var(--drift-y) * 0.8))' },
          '50%': { transform: 'translate(calc(var(--drift-x) * -0.5), var(--drift-y))' },
          '75%': { transform: 'translate(var(--drift-x), calc(var(--drift-y) * 0.35))' },
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.45s cubic-bezier(0.2, 0, 0, 1) both',
        'hero-rise': 'hero-rise 0.7s cubic-bezier(0.32, 0.72, 0, 1) both',
        'particle-float': 'particle-float 20s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1.1s steps(1, end) infinite',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
