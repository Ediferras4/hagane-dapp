/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      desk: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      // Colors come from the CSS variables in src/index.css, so alpha modifiers (bg-moss/70) keep working.
      colors: {
        sumi: 'rgb(var(--c-sumi) / <alpha-value>)',
        moss: 'rgb(var(--c-moss) / <alpha-value>)',
        pine: 'rgb(var(--c-pine) / <alpha-value>)',
        vein: 'rgb(var(--c-vein) / <alpha-value>)',
        mist: 'rgb(var(--c-mist) / <alpha-value>)',
        fog: 'rgb(var(--c-fog) / <alpha-value>)',
        lichen: 'rgb(var(--c-lichen) / <alpha-value>)',
        cyan: {
          DEFAULT: 'rgb(var(--c-cyan) / <alpha-value>)',
          dim: 'rgb(var(--c-cyan-dim) / <alpha-value>)',
        },
        seal: {
          DEFAULT: 'rgb(var(--c-seal) / <alpha-value>)',
          dim: 'rgb(var(--c-seal-dim) / <alpha-value>)',
        },
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Shippori Mincho"', 'serif'],
        heading: ['"Noto Serif"', 'serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
        serif: ['"Noto Serif"', '"Noto Serif JP"', 'serif'],
      },
    },
  },
  plugins: [],
}

