/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Sans', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        subtle: 'var(--subtle)',
        hov: 'var(--hover)',
        line: 'var(--border)',
        edge: 'var(--edge)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        accent: 'var(--accent)',
        accenth: 'var(--accent-hover)',
        accentp: 'var(--accent-pressed)',
        tint: 'var(--accent-tint)',
        danger: 'var(--danger)',
        dangertint: 'var(--danger-tint)',
        success: 'var(--success)',
        successtint: 'var(--success-tint)',
        warn: 'var(--warn)',
        warntint: 'var(--warn-tint)',
      },
      boxShadow: {
        e1: '0 1px 2px rgba(23,23,28,.06), 0 1px 1px rgba(23,23,28,.04)',
        e2: '0 4px 12px -2px rgba(23,23,28,.10), 0 2px 4px rgba(23,23,28,.05)',
        e3: '0 24px 48px -12px rgba(23,23,28,.28)',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
};
